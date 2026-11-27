import {
	type EmailCodeSignInRequest,
	emailCodeSignInResponseSchema,
	type SendSignInCodeRequest,
	type SocialSignInRequest,
	sendSignInCodeResponseSchema,
	sessionResponseSchema,
	signInMethodsResponseSchema,
	signOutResponseSchema,
	socialSignInResponseSchema,
} from "@launchpad/shared";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { api } from "#lib/api/client.ts";

export const sessionQuery = queryOptions({
	queryKey: ["session"],
	queryFn: ({ signal }) =>
		api("/auth/get-session", sessionResponseSchema, { signal }),
});

// Fixed by the server's config: fetched once per page load.
export const signInMethodsQuery = queryOptions({
	queryKey: ["sign-in-methods"],
	queryFn: ({ signal }) =>
		api("/sign-in-methods", signInMethodsResponseSchema, { signal }),
	staleTime: Number.POSITIVE_INFINITY,
});

// On every sign-in and sign-out: drops everything cached except the session (re-read separately) and the server's
// sign-in methods, so the next person on this tab never sees the last one's data: queries keyed without a user id
// would still be fresh.
export function forgetCachedUserData(queryClient: QueryClient): void {
	queryClient.removeQueries({
		predicate: (query) =>
			query.queryKey[0] !== sessionQuery.queryKey[0] &&
			query.queryKey[0] !== signInMethodsQuery.queryKey[0],
	});
}

// Better Auth answers with Google's sign-in page; Google returns to /api/auth/callback/google, which sets the
// cookie and redirects to `callbackURL` (or `errorCallbackURL`, with `error=<code>` added to its query). A failed
// attempt keeps where the person was going, so signing in afterwards still lands there.
export async function signInWithGoogle(callbackURL = "/"): Promise<void> {
	const request: SocialSignInRequest = {
		provider: "google",
		callbackURL,
		errorCallbackURL:
			callbackURL === "/"
				? "/sign-in"
				: `/sign-in?redirect=${encodeURIComponent(callbackURL)}`,
	};
	const { url } = await api(
		"/auth/sign-in/social",
		socialSignInResponseSchema,
		{
			method: "POST",
			json: request,
		},
	);
	window.location.assign(url);
}

export async function sendSignInCode(email: string): Promise<void> {
	const request: SendSignInCodeRequest = { email, type: "sign-in" };
	await api(
		"/auth/email-otp/send-verification-otp",
		sendSignInCodeResponseSchema,
		{ method: "POST", json: request },
	);
}

export async function signInWithCode(
	request: EmailCodeSignInRequest,
): Promise<void> {
	await api("/auth/sign-in/email-otp", emailCodeSignInResponseSchema, {
		method: "POST",
		json: request,
	});
}

export const signOut = () =>
	api("/auth/sign-out", signOutResponseSchema, { method: "POST", json: {} });
