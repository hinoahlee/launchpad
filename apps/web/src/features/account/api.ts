import {
	accountSessionsResponseSchema,
	deleteAccountResponseSchema,
} from "@launchpad/shared";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "#lib/api/client.ts";
import { ApiError } from "#lib/api/errors.ts";

export const accountSessionsQuery = queryOptions({
	queryKey: ["account", "sessions"],
	queryFn: ({ signal }) =>
		api("/account/sessions", accountSessionsResponseSchema, { signal }),
});

// Throws ApiError "SESSION_EXPIRED" when the sign-in isn't recent enough.
export const deleteAccount = () =>
	api("/auth/delete-user", deleteAccountResponseSchema, {
		method: "POST",
		json: {},
	});

export async function revokeSession(id: string): Promise<void> {
	try {
		await api(`/account/sessions/${id}`, z.undefined(), { method: "DELETE" });
	} catch (error) {
		// Already gone: the same outcome.
		if (error instanceof ApiError && error.status === 404) return;
		throw error;
	}
}
