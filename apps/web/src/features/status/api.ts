import { healthResponseSchema, versionResponseSchema } from "@launchpad/shared";
import { queryOptions } from "@tanstack/react-query";
import { api } from "#lib/api.ts";

// Query options: the cache key and how to fetch, in one object. Components call useQuery(versionQuery); every
// component asking for the same key shares one request and one cached result.
export const healthQuery = queryOptions({
	queryKey: ["health"],
	queryFn: ({ signal }) => api("/health", healthResponseSchema, { signal }),
});

export const versionQuery = queryOptions({
	queryKey: ["version"],
	queryFn: ({ signal }) => api("/version", versionResponseSchema, { signal }),
	// A build's commit doesn't change while this tab is open.
	staleTime: Number.POSITIVE_INFINITY,
});
