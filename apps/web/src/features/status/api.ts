import { healthResponseSchema, versionResponseSchema } from "@launchpad/shared";
import { queryOptions } from "@tanstack/react-query";
import { api } from "#lib/api/client.ts";

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
