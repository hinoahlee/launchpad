import {
	authErrorResponseSchema,
	errorResponseSchema,
} from "@launchpad/shared";
import type { z } from "zod";

// A non-2xx answer from the API: `code` is the body's `error` ("validation_failed", "not_found"...), or Better
// Auth's `code` ("INVALID_OTP"...), for
// branching in the UI; `requestId` is what a user quotes in a bug report.
export class ApiError extends Error {
	readonly status: number;
	readonly code: string;
	readonly requestId: string | undefined;

	constructor(status: number, code: string, requestId: string | undefined) {
		super(`API ${status}: ${code}`);
		this.name = "ApiError";
		this.status = status;
		this.code = code;
		this.requestId = requestId;
	}
}

type ApiInit = Omit<RequestInit, "body"> & { json?: unknown };

// The one way the web app calls the API. The response is parsed with the endpoint's schema from
// @launchpad/shared, so a field the API renamed fails here, loudly, instead of showing up as `undefined`
// deep in a component.
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
	// A proxy's error page (a 502 from the platform) isn't JSON: treated like any other failure.
	const body: unknown = await res.json().catch(() => undefined);
	if (!res.ok) {
		const error = errorResponseSchema.safeParse(body);
		if (error.success) {
			throw new ApiError(res.status, error.data.error, error.data.requestId);
		}
		// /api/auth/* answers in Better Auth's shape: `{ code: "INVALID_OTP", message }`.
		const authError = authErrorResponseSchema.safeParse(body);
		throw new ApiError(
			res.status,
			authError.success ? authError.data.code : "http_error",
			undefined,
		);
	}
	return schema.parse(body);
}
