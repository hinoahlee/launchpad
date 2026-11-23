import {
	authErrorResponseSchema,
	errorResponseSchema,
} from "@launchpad/shared";
import type { z } from "zod";
import { ApiError } from "./errors.ts";

type ApiInit = Omit<RequestInit, "body"> & { json?: unknown };

// The one way the web app calls the API: responses are parsed with the endpoint's schema from @launchpad/shared.
export async function api<S extends z.ZodType>(
	path: `/${string}`,
	schema: S,
	{ json, headers, ...init }: ApiInit = {},
): Promise<z.output<S>> {
	const res = await fetch(`/api${path}`, {
		...init,
		headers: {
			accept: "application/json",
			...(json !== undefined && { "content-type": "application/json" }),
			...headers,
		},
		...(json !== undefined && { body: JSON.stringify(json) }),
	});
	// A proxy error page (502) isn't JSON.
	const body: unknown = await res.json().catch(() => undefined);
	if (!res.ok) {
		const error = errorResponseSchema.safeParse(body);
		if (error.success) {
			throw new ApiError(res.status, error.data.error, error.data.requestId);
		}
		const authError = authErrorResponseSchema.safeParse(body);
		throw new ApiError(
			res.status,
			authError.success ? authError.data.code : "http_error",
			undefined,
		);
	}
	return schema.parse(body);
}
