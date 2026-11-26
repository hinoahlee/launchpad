import { STATUS_CODES } from "node:http";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";
import { reportError } from "#lib/sentry.ts";
import { HttpError } from "./errors.ts";

// 413 → "payload_too_large".
function statusCode(status: number): string {
	return (STATUS_CODES[status] ?? "error")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_");
}

// Anything a route throws, plus Fastify's own client errors (bad JSON, body too large).
export function errorHandler(
	err: FastifyError,
	request: FastifyRequest,
	reply: FastifyReply,
) {
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
	const trusted = err instanceof HttpError || err.code?.startsWith("FST_");
	const status =
		trusted && err.statusCode !== undefined && err.statusCode >= 400
			? err.statusCode
			: 500;
	reply.code(status);
	if (status >= 500) {
		// Never send the message: it can name tables or hosts.
		request.log.error({ err }, "unhandled error");
		reportError(err, { requestId: request.id });
		return { error: "internal_error" };
	}
	return { error: statusCode(status) };
}
