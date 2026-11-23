// Called by the platform every few seconds: never rate-limited, logged at debug when they succeed.
export const PROBE_PATHS: ReadonlySet<string> = new Set([
	"/api/health",
	"/api/ready",
]);

// Requests per minute per client IP on /api.
export const RATE_LIMIT_MAX = 100;
