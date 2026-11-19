import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { STATUS_CODES } from "node:http";
import path from "node:path";
import fastifyCompress from "@fastify/compress";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { createDb, type Database } from "@launchpad/db";
import {
	errorResponseSchema,
	healthResponseSchema,
	versionResponseSchema,
} from "@launchpad/shared";
import { sql } from "drizzle-orm";
import Fastify, {
	type FastifyError,
	type FastifyInstance,
	LogController,
} from "fastify";
import {
	hasZodFastifySchemaValidationErrors,
	serializerCompiler,
	validatorCompiler,
	type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { DestinationStream } from "pino";
import type { Config } from "./config.ts";
import { greetingRoutes } from "./features/greeting/routes.ts";
import { loggerOptions } from "./lib/logger.ts";
import { reportError } from "./lib/sentry.ts";

// `app.db` in every route and plugin, typed.
declare module "fastify" {
	interface FastifyInstance {
		db: Database;
	}
}

// Accept a caller's request ID (e.g. from a load balancer) only if it looks like an ID, so a client
// can't push huge or multi-line strings into our logs.
const REQUEST_ID = /^[\w-]{1,128}$/;

// The built SPA. The same relative path works from src/app.ts (dev) and dist/server.js (the step 1.2 bundle).
const DEFAULT_WEB_ROOT = path.resolve(import.meta.dirname, "../../web/dist");

const API_PATH = /^\/api(\/|\?|$)/;

// Probes the platform calls every few seconds. Their successful lines go to `debug`, so they don't bury real
// traffic at the default `info` level; a failing probe still logs at `info` or above.
const PROBES = new Set(["/api/health", "/api/ready"]);

// 413 → "payload_too_large": the error code for a client error Fastify raised itself (bad JSON, body too big).
function statusCode(status: number): string {
	return (STATUS_CODES[status] ?? "error")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_");
}

// How long /api/ready waits for the database. Well under Render's 5 s per health check, so a slow database
// shows up as our 503, not as a check that timed out with no answer.
const READY_TIMEOUT_MS = 2_000;

export type BuildOptions = {
	// Folder holding index.html and assets/. Tests point it at a fixture.
	webRoot?: string;
	// Tests shorten it to keep the "database never answers" case fast.
	readyTimeoutMs?: number;
	// Where log lines go (default stdout). Tests capture them here.
	logStream?: DestinationStream;
	// Requests per minute per client IP on /api. Tests lower it.
	rateLimitMax?: number;
};

const RATE_LIMIT_MAX = 100;

// Rejects if `promise` hasn't settled within `ms`. The query itself isn't cancelled: it ends on its own
// (connect_timeout), and the probe has already answered.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	let timer: NodeJS.Timeout | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// App factory: builds a fully configured app without listening on a port, so tests can use it in-process.
export function buildApp(
	config: Config,
	{
		webRoot = DEFAULT_WEB_ROOT,
		readyTimeoutMs = READY_TIMEOUT_MS,
		logStream,
		rateLimitMax = RATE_LIMIT_MAX,
	}: BuildOptions = {},
): FastifyInstance {
	const app = Fastify({
		logger: {
			...loggerOptions(config.LOG_LEVEL),
			...(logStream && { stream: logStream }),
		},
		logController: new LogController({
			requestIdLogLabel: "requestId",
			// Fastify's own two lines per request ("incoming request", "request completed") are replaced by
			// the single line in onResponse below.
			disableRequestLogging: true,
		}),
		// Behind a proxy, the socket's address is the proxy's. Trusting exactly the proxies we have makes
		// `request.ip` the visitor's address, taken from X-Forwarded-For counting from the right (the end our
		// proxies write), so a value the client sends at the left is ignored.
		// `hop` 0 is the socket's address, 1 the rightmost X-Forwarded-For entry, and so on.
		trustProxy: (_address, hop) => hop < config.TRUST_PROXY_HOPS,
		genReqId: (req) => {
			const incoming = req.headers["x-request-id"];
			return typeof incoming === "string" && REQUEST_ID.test(incoming)
				? incoming
				: randomUUID();
		},
	});

	// Route schemas are Zod schemas (from @launchpad/shared): Zod checks each request and shapes each response.
	// Set before any route is added: Fastify compiles a route's schemas when the route is registered.
	app.setValidatorCompiler(validatorCompiler);
	app.setSerializerCompiler(serializerCompiler);

	// Security headers on every response (pages, assets, API). The CSP is the one that matters most: the page
	// may run only scripts from our own origin, so injected markup (`<script>`, `onclick=`) won't execute.
	app.register(fastifyHelmet, {
		contentSecurityPolicy: {
			useDefaults: false,
			directives: {
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'"],
				scriptSrcAttr: ["'none'"],
				// Inline styles allowed: Radix (shadcn/ui's menus and dialogs) injects a <style> tag to lock page
				// scroll while open. Injected CSS can't run code; scripts stay locked to our own files.
				styleSrc: ["'self'", "'unsafe-inline'"],
				imgSrc: ["'self'", "data:"],
				fontSrc: ["'self'"],
				// The browser's Sentry SDK posts errors to its ingest host (the DSN's), e.g. o1.ingest.us.sentry.io.
				connectSrc: [
					"'self'",
					"https://*.ingest.sentry.io",
					"https://*.ingest.us.sentry.io",
					"https://*.ingest.de.sentry.io",
				],
				objectSrc: ["'none'"],
				baseUri: ["'self'"],
				formAction: ["'self'"],
				frameAncestors: ["'none'"],
			},
		},
		// HSTS: browsers use HTTPS only for this host for a year. Helmet's default; ignored over plain HTTP, so
		// local runs on http://localhost are unaffected.
		strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
	});

	// gzip/brotli for text responses over 1 KB (JSON, HTML, JS, CSS), when the client accepts it. Render's edge
	// already compresses; this covers platforms whose proxy doesn't (an AWS load balancer).
	app.register(fastifyCompress);

	// The pool opens connections on first use, so building the app never touches the database. Closed last
	// on shutdown: app.close() waits for in-flight requests first, then runs onClose hooks.
	const db = createDb(config.DATABASE_URL);
	app.decorate("db", db);
	app.addHook("onClose", async () => {
		await db.$client.end({ timeout: 5 });
	});

	// Echo the ID back so a user or another service can quote it when reporting a problem.
	app.addHook("onRequest", async (request, reply) => {
		reply.header("x-request-id", request.id);
	});

	// Every error body carries the ID too: `{ error, requestId }`. Someone pasting the response into a bug
	// report hands you the search term for the logs.
	app.addHook("preSerialization", async (request, reply, payload) => {
		if (
			reply.statusCode >= 400 &&
			typeof payload === "object" &&
			payload !== null &&
			"error" in payload
		) {
			return { ...payload, requestId: request.id };
		}
		return payload;
	});

	// One line per request, written once the response is sent. `requestId` is added by the request's logger.
	app.addHook("onResponse", async (request, reply) => {
		const status = reply.statusCode;
		const level =
			status >= 500
				? "error"
				: status < 400 && PROBES.has(request.url)
					? "debug"
					: "info";
		request.log[level](
			{
				method: request.method,
				// The pattern (`/api/users/:id`) groups requests to one endpoint; unset when nothing matched.
				route: request.routeOptions.url,
				// The path as called, without the query string (which can carry tokens).
				url: request.url.split("?")[0],
				status,
				durationMs: Math.round(reply.elapsedTime),
			},
			"request",
		);
	});

	// Anything a route throws, plus Fastify's own client errors (bad JSON, body too large).
	app.setErrorHandler((err: FastifyError, request, reply) => {
		// A request that doesn't match its route's schema: say which fields are wrong, so the caller can fix it.
		if (hasZodFastifySchemaValidationErrors(err)) {
			reply.code(400);
			return {
				error: "validation_failed",
				details: err.validation.map((issue) => ({
					path: issue.instancePath,
					message: issue.message,
				})),
			};
		}
		const status =
			err.statusCode !== undefined && err.statusCode >= 400
				? err.statusCode
				: 500;
		reply.code(status);
		if (status >= 500) {
			// The stack goes to the log; the client gets a code, never the message (it can name tables, hosts...).
			request.log.error({ err }, "unhandled error");
			reportError(err, request.id);
			return { error: "internal_error" };
		}
		return { error: statusCode(status) };
	});

	app.register(
		async (root) => {
			// Typed routes: each handler's request and return value are inferred from its Zod schemas.
			const api = root.withTypeProvider<ZodTypeProvider>();

			// Per client IP, across every /api route: slows down scripts guessing passwords or scraping. Counters
			// live in this process's memory: fine for one instance, but each instance counts on its own and a
			// restart resets them. With several instances, pass a shared store (`redis:` or `store:`) here.
			await api.register(fastifyRateLimit, {
				max: rateLimitMax,
				timeWindow: "1 minute",
				// The platform's health checks and the uptime monitor call these every few seconds.
				allowList: (request) => PROBES.has(request.url),
			});

			// Liveness: failing means "restart me". Never check dependencies here: restarts don't fix a DB outage.
			api.get(
				"/health",
				{ schema: { response: { 200: healthResponseSchema } } },
				async () => ({ status: "ok" as const }),
			);

			// Readiness: failing means "stop routing to me": this instance can't do its job without the database.
			// During shutdown Fastify already answers 503 (`return503OnClosing`).
			const readySchema = {
				response: { 200: healthResponseSchema, 503: errorResponseSchema },
			};
			api.get("/ready", { schema: readySchema }, async (request, reply) => {
				try {
					await withTimeout(db.execute(sql`select 1`), readyTimeoutMs);
					return { status: "ok" as const };
				} catch (err) {
					request.log.warn({ err }, "readiness check failed");
					reply.code(503);
					return { error: "database_unavailable" };
				}
			});

			// Which build is answering. The deploy job polls this until it reports the commit it deployed.
			api.get(
				"/version",
				{ schema: { response: { 200: versionResponseSchema } } },
				async () => ({ sha: config.GIT_SHA }),
			);

			api.register(greetingRoutes);

			// Off unless DEBUG_ERROR_ROUTE=true: a public route that throws would let anyone fill the Sentry quota.
			if (config.DEBUG_ERROR_ROUTE) {
				api.get("/debug/error", async () => {
					throw new Error("Test error from GET /api/debug/error");
				});
			}
		},
		{ prefix: "/api" },
	);

	// In dev, Vite serves the SPA and there's usually no build. In production a missing build means a broken
	// image, so refuse to boot instead of answering every page with a 404.
	const serveWeb = existsSync(path.join(webRoot, "index.html"));
	if (!serveWeb && config.NODE_ENV === "production") {
		throw new Error(`SPA build not found at ${webRoot}`);
	}

	if (serveWeb) {
		app.register(fastifyStatic, {
			root: webRoot,
			cacheControl: false, // replaced by the two policies below
			setHeaders: (reply, filePath) => {
				// Vite puts a content hash in every file name under assets/, so a changed file gets a new URL and
				// the old one can be cached forever. Everything else (index.html, favicon) is revalidated each visit.
				const hashed = filePath.includes(`${path.sep}assets${path.sep}`);
				reply.header(
					"Cache-Control",
					hashed ? "public, max-age=31536000, immutable" : "no-cache",
				);
			},
		});
	}

	app.setNotFoundHandler((request, reply) => {
		// SPA fallback: a browser navigation to a client-side route (/settings, /any/route) gets the app shell.
		// Only page loads (Accept: text/html), so a missing script or API route never gets HTML back.
		const isPageLoad =
			(request.method === "GET" || request.method === "HEAD") &&
			!API_PATH.test(request.url) &&
			request.headers.accept?.includes("text/html");
		if (serveWeb && isPageLoad) {
			return reply.sendFile("index.html");
		}
		reply.code(404);
		return { error: "not_found" };
	});

	return app;
}
