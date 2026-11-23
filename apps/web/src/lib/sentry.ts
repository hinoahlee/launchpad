import * as Sentry from "@sentry/react";
import type { ErrorInfo } from "react";
import type { RootOptions } from "react-dom/client";
import type { Config } from "#config.ts";

export function initSentry(config: Config): void {
	if (!config.VITE_SENTRY_DSN) return;
	Sentry.init({
		dsn: config.VITE_SENTRY_DSN,
		// Must match the release vite.config.ts uploads source maps for.
		release: config.VITE_GIT_SHA,
		environment: config.MODE,
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

// Sentry and react-dom type the same errorInfo object differently.
function forRoot(
	handler: ReturnType<typeof Sentry.reactErrorHandler>,
): RootErrorHandler {
	return (error, errorInfo) => handler(error, errorInfo as ErrorInfo);
}

export const reactErrorOptions: RootOptions = {
	onUncaughtError: forRoot(
		Sentry.reactErrorHandler((error) => console.error(error)),
	),
	onCaughtError: forRoot(Sentry.reactErrorHandler()),
	onRecoverableError: forRoot(Sentry.reactErrorHandler()),
};

// Open /#sentry-test to throw a test error (checks reporting and source maps).
export function throwTestErrorIfAsked(): void {
	if (window.location.hash !== "#sentry-test") return;
	setTimeout(() => {
		throw new Error("Test error from /#sentry-test");
	});
}
