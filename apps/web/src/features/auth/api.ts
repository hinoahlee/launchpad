import {
	type EmailCodeSignInRequest,
	emailCodeSignInResponseSchema,
	type SendSignInCodeRequest,
	type SocialSignInRequest,
	sendSignInCodeResponseSchema,
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
// the session cookie and redirects to `callbackURL` (a path here: Better Auth refuses other sites), or to `errorCallbackURL?error=<code>` if it failed.
export async function signInWithGoogle(callbackURL = "/"): Promise<void> {
	const request: SocialSignInRequest = {
		provider: "google",
		callbackURL,
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

// Email sign-in, step 1: Better Auth stores a code and the API queues an email with it. The answer is the
// same whether the address has an account or not (a first sign-in creates one).
export async function sendSignInCode(email: string): Promise<void> {
	const request: SendSignInCodeRequest = { email, type: "sign-in" };
	await api(
		"/auth/email-otp/send-verification-otp",
		sendSignInCodeResponseSchema,
		{ method: "POST", json: request },
	);
}

// Step 2: trade the code for a session. Better Auth sets the session cookie on this response.
export async function signInWithCode(
	request: EmailCodeSignInRequest,
): Promise<void> {
	await api("/auth/sign-in/email-otp", emailCodeSignInResponseSchema, {
		method: "POST",
		json: request,
	});
}

// Deletes the session row (so the token stops working everywhere) and clears the cookie.
export const signOut = () =>
	api("/auth/sign-out", signOutResponseSchema, { method: "POST", json: {} });
