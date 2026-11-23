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
import { api } from "#lib/api/client.ts";

export const sessionQuery = queryOptions({
	queryKey: ["session"],
	queryFn: ({ signal }) =>
		api("/auth/get-session", sessionResponseSchema, { signal }),
});

// Better Auth answers with Google's sign-in page; Google returns to /api/auth/callback/google, which sets the
// cookie and redirects to `callbackURL` (or `errorCallbackURL?error=<code>`).
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
