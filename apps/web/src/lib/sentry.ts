import * as Sentry from "@sentry/react";
import type { ErrorInfo } from "react";
import type { RootOptions } from "react-dom/client";
import type { Config } from "#config.ts";

// Error tracking in each visitor's browser. A no-op without VITE_SENTRY_DSN: Sentry's functions do nothing
// until init runs.
export function initSentry(config: Config): void {
	if (!config.VITE_SENTRY_DSN) return;
	Sentry.init({
		dsn: config.VITE_SENTRY_DSN,
		// Must match the release the CI build uploaded source maps for (vite.config.ts).
		release: config.VITE_GIT_SHA,
		environment: config.MODE,
		// Sampling: every error (1.0). No tracing or session replay: not needed yet, and replay records screens.
		sampleRate: 1,
		dataCollection: {
			userInfo: false,
			cookies: false,
			httpHeaders: false,
			urlQueryParams: false,
			httpBodies: [],
		},
	});
}

type RootErrorHandler = NonNullable<RootOptions["onCaughtError"]>;

// Sentry types the second argument as React's ErrorInfo (componentStack: string | null), react-dom's root
// options as { componentStack?: string }. It's the same object at runtime; only the types disagree.
function forRoot(
	handler: ReturnType<typeof Sentry.reactErrorHandler>,
): RootErrorHandler {
	return (error, errorInfo) => handler(error, errorInfo as ErrorInfo);
}

// React 19 reports render errors through these root options instead of window.onerror.
export const reactErrorOptions: RootOptions = {
	onUncaughtError: forRoot(
		Sentry.reactErrorHandler((error) => console.error(error)),
	),
	onCaughtError: forRoot(Sentry.reactErrorHandler()),
	onRecoverableError: forRoot(Sentry.reactErrorHandler()),
};

// Open the app at /#sentry-test to throw a test error from our own bundle, to check reporting and source maps.
// Thrown outside React (in a timer), so it reaches Sentry's global error handler like any uncaught error.
export function throwTestErrorIfAsked(): void {
	if (window.location.hash !== "#sentry-test") return;
	setTimeout(() => {
		throw new Error("Test error from /#sentry-test");
	});
}
