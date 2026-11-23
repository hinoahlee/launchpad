import path from "node:path";
import fastifyCompress from "@fastify/compress";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import { createDb, type Database } from "@launchpad/db";
import Fastify, { type FastifyInstance, LogController } from "fastify";
import {
	serializerCompiler,
	validatorCompiler,
	type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { DestinationStream } from "pino";
import type { Config } from "#config/schema.ts";
import { appUrl } from "#config/utils.ts";
import { accountRoutes } from "#features/account/routes.ts";
import { authRoutes } from "#features/auth/routes.ts";
import { signInMethodsRoutes } from "#features/auth/sign-in-methods/routes.ts";
import { createBillingDriver } from "#features/billing/driver/create.ts";
import type { BillingDriver } from "#features/billing/driver/types.ts";
import { billingRoutes } from "#features/billing/routes.ts";
import { stripeWebhookRoutes } from "#features/billing/webhook/routes.ts";
import { resendWebhookRoutes } from "#features/email-webhooks/routes.ts";
import { fileRoutes } from "#features/files/routes.ts";
import { greetingRoutes } from "#features/greeting/routes.ts";
import { READY_TIMEOUT_MS } from "#features/probes/constants.ts";
import { probeRoutes } from "#features/probes/routes.ts";
import { RATE_LIMIT_MAX } from "#http/constants.ts";
import { errorHandler } from "#http/error-handler.ts";
import { rateLimitOptions } from "#http/rate-limit.ts";
import {
	registerRequestLogging,
	requestIdFrom,
} from "#http/request-logging.ts";
import { requireSameOrigin } from "#http/same-origin.ts";
import { securityHeaders } from "#http/security-headers.ts";
import { registerSpa } from "#http/spa.ts";
import { type Auth, createAuth } from "#lib/auth/create.ts";
import { loggerOptions } from "#lib/logger.ts";
import { createStorageDriver } from "#lib/storage/driver/create.ts";
import type { StorageDriver } from "#lib/storage/driver/types.ts";

declare module "fastify" {
	interface FastifyInstance {
		db: Database;
		auth: Auth;
	}
}

// Resolved here, not in http/: the same relative path works from src/ (dev) and dist/ (the bundle).
const DEFAULT_WEB_ROOT = path.resolve(import.meta.dirname, "../../web/dist");

// Every option exists for tests; production uses the defaults.
export type BuildOptions = {
	webRoot?: string;
	readyTimeoutMs?: number;
	logStream?: DestinationStream;
	rateLimitMax?: number;
	storage?: StorageDriver;
	billing?: BillingDriver;
};

// Builds the app without listening, so tests can call it in-process with `app.inject()`.
export function buildApp(
	config: Config,
	{
		webRoot = DEFAULT_WEB_ROOT,
		readyTimeoutMs = READY_TIMEOUT_MS,
		logStream,
		rateLimitMax = RATE_LIMIT_MAX,
		storage = createStorageDriver(config),
		billing = createBillingDriver(config),
	}: BuildOptions = {},
): FastifyInstance {
	const app = Fastify({
		logger: {
			...loggerOptions(config.LOG_LEVEL),
			...(logStream && { stream: logStream }),
		},
		logController: new LogController({
			requestIdLogLabel: "requestId",
			disableRequestLogging: true,
		}),
		// Hop 0 is the socket, 1 the rightmost X-Forwarded-For entry: trusting exactly our proxies makes
		// `request.ip` the visitor's address, and ignores whatever the client put on the left.
		trustProxy: (_address, hop) => hop < config.TRUST_PROXY_HOPS,
		genReqId: requestIdFrom,
	});

	// Before any route: Fastify compiles a route's schemas when it is registered.
	app.setValidatorCompiler(validatorCompiler);
	app.setSerializerCompiler(serializerCompiler);

	app.register(fastifyHelmet, securityHeaders(storage?.origin));
	app.register(fastifyCompress);

	const db = createDb(config.DATABASE_URL);
	app.decorate("db", db);
	// onClose runs after in-flight requests finish.
	app.addHook("onClose", async () => {
		await db.$client.end({ timeout: 5 });
	});

	const auth = createAuth(config, db, app.log);
	app.decorate("auth", auth);
	app.decorateRequest("authSession", null);
	app.decorateRequest("membership", null);

	registerRequestLogging(app);
	app.setErrorHandler(errorHandler);

	app.register(
		async (root) => {
			const api = root.withTypeProvider<ZodTypeProvider>();
			await api.register(fastifyRateLimit, rateLimitOptions(rateLimitMax));
			api.addHook("onRequest", requireSameOrigin(appUrl(config)));

			api.register(probeRoutes({ db, gitSha: config.GIT_SHA, readyTimeoutMs }));
			api.register(authRoutes(auth, appUrl(config)), { prefix: "/auth" });
			api.register(
				signInMethodsRoutes({
					google: Boolean(
						config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET,
					),
				}),
			);
			api.register(greetingRoutes);
			api.register(accountRoutes);
			api.register(billingRoutes(billing, appUrl(config)), {
				prefix: "/organizations/:organizationId",
			});

			// Optional integrations: their routes exist only when configured.
			if (storage) {
				api.register(fileRoutes(storage), {
					prefix: "/organizations/:organizationId",
				});
			}
			if (billing && config.STRIPE_WEBHOOK_SECRET) {
				api.register(
					stripeWebhookRoutes(billing, config.STRIPE_WEBHOOK_SECRET),
				);
			}
			if (config.RESEND_WEBHOOK_SECRET) {
				api.register(resendWebhookRoutes(config.RESEND_WEBHOOK_SECRET));
			}
			// A public route that throws would let anyone burn the Sentry quota.
			if (config.DEBUG_ERROR_ROUTE) {
				api.get("/debug/error", async () => {
					throw new Error("Test error from GET /api/debug/error");
				});
			}
		},
		{ prefix: "/api" },
	);

	registerSpa(app, { webRoot, production: config.NODE_ENV === "production" });

	return app;
}
