import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance, LogController } from "fastify";
import type { Config } from "./config.ts";

// Accept a caller's request ID (e.g. from a load balancer) only if it looks like an ID, so a client
// can't push huge or multi-line strings into our logs.
const REQUEST_ID = /^[\w-]{1,128}$/;

// App factory: builds a fully configured app without listening on a port, so tests can use it in-process.
export function buildApp(config: Config): FastifyInstance {
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

			// Readiness: failing means "stop routing to me". Same as /health until phase 4 adds the DB check.
			// During shutdown Fastify already answers 503 (`return503OnClosing`).
			api.get("/ready", async () => ({ status: "ok" }));
		},
		{ prefix: "/api" },
	);

	return app;
}
