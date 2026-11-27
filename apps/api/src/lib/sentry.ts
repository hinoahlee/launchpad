import * as Sentry from "@sentry/node";
import type { Config } from "#config/schema.ts";
import { safeError } from "#lib/safe-error.ts";

type Overrides = Pick<Sentry.NodeOptions, "transport">;

// Without SENTRY_DSN, a no-op: captureException does nothing until init runs.
export function initSentry(config: Config, overrides: Overrides = {}): void {
	if (!config.SENTRY_DSN) return;
	Sentry.init({
		dsn: config.SENTRY_DSN,
		release: config.GIT_SHA,
		environment: config.SENTRY_ENVIRONMENT ?? config.NODE_ENV,
		sampleRate: 1,
		// Same rule as the logs: no personal data or request contents.
		dataCollection: {
			userInfo: false,
			cookies: false,
			httpHeaders: false,
			urlQueryParams: false,
			httpBodies: [],
		},
		// http/error-handler.ts reports 5xx; Sentry's Fastify integration would report them twice.
		integrations: (defaults) =>
			defaults.filter((integration) => integration.name !== "Fastify"),
		...overrides,
	});
}

// Tags (`requestId`, `jobId`) lead from the Sentry issue to the log lines.
export function reportError(err: unknown, tags: Record<string, string>): void {
	Sentry.captureException(safeError(err), { tags });
}

export async function flushSentry(timeoutMs = 2_000): Promise<void> {
	await Sentry.close(timeoutMs);
}
