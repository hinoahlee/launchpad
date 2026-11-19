import * as Sentry from "@sentry/node";
import type { Config } from "#config.ts";

type Overrides = Pick<Sentry.NodeOptions, "transport">;

// Error tracking. A no-op without SENTRY_DSN: captureException does nothing until init runs.
export function initSentry(config: Config, overrides: Overrides = {}): void {
	if (!config.SENTRY_DSN) return;
	Sentry.init({
		dsn: config.SENTRY_DSN,
		// Ties each error to the commit that produced it, so "which deploy broke this?" is one click.
		release: config.GIT_SHA,
		environment: config.SENTRY_ENVIRONMENT ?? config.NODE_ENV,
		// Sampling: send every error (1.0); tracing (timing every request) stays off until we need it.
		sampleRate: 1,
		// Same rule as the logs: no user info, cookies, headers, query strings or bodies on events. The stack
		// trace and the request ID tag are enough to find the cause; the rest is in our own logs.
		dataCollection: {
			userInfo: false,
			cookies: false,
			httpHeaders: false,
			urlQueryParams: false,
			httpBodies: [],
		},
		// Our error handler reports 5xx (app.ts); Sentry's Fastify integration would report them a second time.
		integrations: (defaults) =>
			defaults.filter((integration) => integration.name !== "Fastify"),
		...overrides,
	});
}

// Reports an unexpected error. The tags (`requestId`, or `jobId` in the worker) lead from the Sentry issue to
// the matching log lines.
export function reportError(err: unknown, tags: Record<string, string>): void {
	Sentry.captureException(err, { tags });
}

// Sends what's queued before the process exits (at most `timeoutMs`).
export async function flushSentry(timeoutMs = 2_000): Promise<void> {
	await Sentry.close(timeoutMs);
}
