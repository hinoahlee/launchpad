import { type DestinationStream, type LoggerOptions, pino } from "pino";
import type { Config } from "#config/schema.ts";

// A safety net, not a licence: never log request bodies or headers on purpose.
const REDACT = [
	"authorization",
	"cookie",
	"password",
	"token",
	"*.authorization",
	"*.cookie",
	"*.password",
	"*.token",
	'*["set-cookie"]',
	"*.headers.authorization",
	"*.headers.cookie",
	'*.headers["set-cookie"]',
];

// The same JSON-to-stdout config for server, worker and migrate.
export function loggerOptions(level: Config["LOG_LEVEL"]): LoggerOptions {
	return { level, redact: { paths: REDACT, censor: "[redacted]" } };
}

// For the worker and migrate (Fastify builds its own from loggerOptions).
export function createLogger(
	level: Config["LOG_LEVEL"],
	destination?: DestinationStream,
) {
	return pino(loggerOptions(level), destination);
}
