import { type DestinationStream, type LoggerOptions, pino } from "pino";
import type { Config } from "#config.ts";

// Fields replaced with "[redacted]" wherever they appear at the top level or one level down (`*.x`), e.g.
// `{ password }`, `{ body: { password } }`, `{ headers: { authorization } }`. A safety net, not a licence:
// never log a request body or headers on purpose.
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

// The one logger config for every process (server, worker, migrate): JSON lines to stdout, same level
// names and redaction, so a search in the platform's log view works the same across all of them.
export function loggerOptions(level: Config["LOG_LEVEL"]): LoggerOptions {
	return { level, redact: { paths: REDACT, censor: "[redacted]" } };
}

// For processes that aren't Fastify (worker, migrate). `destination` lets tests capture the lines.
export function createLogger(
	level: Config["LOG_LEVEL"],
	destination?: DestinationStream,
) {
	return pino(loggerOptions(level), destination);
}
