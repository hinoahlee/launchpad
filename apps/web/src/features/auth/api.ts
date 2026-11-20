import {
	type SocialSignInRequest,
	sessionResponseSchema,
	signOutResponseSchema,
	socialSignInResponseSchema,
} from "@launchpad/shared";
import { queryOptions } from "@tanstack/react-query";
import { api } from "#lib/api.ts";

// Who is signed in (null: nobody). The browser sends the session cookie by itself; Better Auth looks it up.
export const sessionQuery = queryOptions({
	queryKey: ["session"],
	queryFn: ({ signal }) =>
		api("/auth/get-session", sessionResponseSchema, { signal }),
});

// Step 1 of signing in with Google: Better Auth answers with Google's sign-in page (state and PKCE values
// included), and the browser goes there. Google sends it back to /api/auth/callback/google, Better Auth sets
// the session cookie and redirects to `callbackURL`, or to `errorCallbackURL?error=<code>` if it failed.
export async function signInWithGoogle(): Promise<void> {
	const request: SocialSignInRequest = {
		provider: "google",
		callbackURL: "/",
		errorCallbackURL: "/sign-in",
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

// Deletes the session row (so the token stops working everywhere) and clears the cookie.
export const signOut = () =>
	api("/auth/sign-out", signOutResponseSchema, { method: "POST", json: {} });
