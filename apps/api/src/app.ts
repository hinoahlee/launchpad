import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, LogController } from "fastify";
import type { Config } from "./config.ts";

// Accept a caller's request ID (e.g. from a load balancer) only if it looks like an ID, so a client
// can't push huge or multi-line strings into our logs.
const REQUEST_ID = /^[\w-]{1,128}$/;

// The built SPA. The same relative path works from src/app.ts (dev) and dist/server.js (the step 1.2 bundle).
const DEFAULT_WEB_ROOT = path.resolve(import.meta.dirname, "../../web/dist");

const API_PATH = /^\/api(\/|\?|$)/;

export type BuildOptions = {
	// Folder holding index.html and assets/. Tests point it at a fixture.
	webRoot?: string;
};

// App factory: builds a fully configured app without listening on a port, so tests can use it in-process.
export function buildApp(
	config: Config,
	{ webRoot = DEFAULT_WEB_ROOT }: BuildOptions = {},
): FastifyInstance {
	const app = Fastify({
		logger: { level: config.LOG_LEVEL },
		logController: new LogController({ requestIdLogLabel: "requestId" }),
		genReqId: (req) => {
			const incoming = req.headers["x-request-id"];
			return typeof incoming === "string" && REQUEST_ID.test(incoming)
				? incoming
				: randomUUID();
		},
	});

	// Echo the ID back so a user or another service can quote it when reporting a problem.
	app.addHook("onRequest", async (request, reply) => {
		reply.header("x-request-id", request.id);
	});

	app.register(
		async (api) => {
			// Liveness: failing means "restart me". Never check dependencies here: restarts don't fix a DB outage.
			api.get("/health", async () => ({ status: "ok" }));

			// Readiness: failing means "stop routing to me". Same as /health until phase 5 adds the DB check.
			// During shutdown Fastify already answers 503 (`return503OnClosing`).
			api.get("/ready", async () => ({ status: "ok" }));

			// Which build is answering. The deploy job polls this until it reports the commit it deployed.
			api.get("/version", async () => ({ sha: config.GIT_SHA }));
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
