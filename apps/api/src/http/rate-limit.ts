import { normalizeIP, type RateLimitPluginOptions } from "@fastify/rate-limit";
import { PROBE_PATHS } from "./constants.ts";

// Per client IP, in this process's memory: each instance counts on its own. Running several instances, pass a
// shared store (`redis`) here.
export function rateLimitOptions(max: number): RateLimitPluginOptions {
	return {
		max,
		timeWindow: "1 minute",
		// A client that hung up before this ran has no `request.ip`, and the default key generator crashes on it.
		keyGenerator: (request) =>
			request.ip ? normalizeIP(request.ip) : "client-gone",
		allowList: (request) => PROBE_PATHS.has(request.url),
	};
}
