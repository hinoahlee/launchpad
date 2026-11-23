import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { FastifyInstance } from "fastify";
import { PROBE_PATHS } from "./constants.ts";

// A caller's ID is kept only if it looks like one, so clients can't push huge or multi-line strings into logs.
const REQUEST_ID = /^[\w-]{1,128}$/;

export function requestIdFrom(req: IncomingMessage): string {
	const incoming = req.headers["x-request-id"];
	return typeof incoming === "string" && REQUEST_ID.test(incoming)
		? incoming
		: randomUUID();
}

// The request ID on every response (header, and `requestId` in error bodies), and one log line per request.
// Fastify's own request logging is disabled in app.ts.
export function registerRequestLogging(app: FastifyInstance): void {
	app.addHook("onRequest", async (request, reply) => {
		reply.header("x-request-id", request.id);
	});

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

	app.addHook("onResponse", async (request, reply) => {
		const status = reply.statusCode;
		const level =
			status >= 500
				? "error"
				: status < 400 && PROBE_PATHS.has(request.url)
					? "debug"
					: "info";
		request.log[level](
			{
				method: request.method,
				route: request.routeOptions.url,
				// Without the query string, which can carry tokens.
				url: request.url.split("?")[0],
				status,
				durationMs: Math.round(reply.elapsedTime),
			},
			"request",
		);
	});
}
