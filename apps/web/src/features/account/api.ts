import {
	accountSessionsResponseSchema,
	deleteAccountResponseSchema,
} from "@launchpad/shared";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { ApiError, api } from "#lib/api.ts";

// The signed-in user's devices (GET /api/account/sessions, behind requireSession).
export const accountSessionsQuery = queryOptions({
	queryKey: ["account", "sessions"],
	queryFn: ({ signal }) =>
		api("/account/sessions", accountSessionsResponseSchema, { signal }),
});

// Deletes the account for good (Better Auth's endpoint; the API deletes every session and clears the cookie).
// Throws ApiError with code "SESSION_EXPIRED" when the sign-in isn't recent enough: sign in again first.
export const deleteAccount = () =>
	api("/auth/delete-user", deleteAccountResponseSchema, {
		method: "POST",
		json: {},
	});

// Signs one device out (204, no body).
export async function revokeSession(id: string): Promise<void> {
	try {
		await api(`/account/sessions/${id}`, z.undefined(), { method: "DELETE" });
	} catch (error) {
		// Already gone (signed out elsewhere, or expired): the same outcome. The list refetches either way.
		if (error instanceof ApiError && error.status === 404) return;
		throw error;
	}
}
