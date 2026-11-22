import { z } from "zod";

// Better Auth's endpoints (/api/auth/*), as far as the web app reads them. Better Auth defines them, not us, so
// these list only the fields we use; a test in the API checks Better Auth's answers still match.

// POST /api/auth/sign-in/social: the provider's sign-in page, where the browser goes next.
export const socialSignInRequestSchema = z.object({
	provider: z.literal("google"),
	// Where Better Auth sends the browser after a successful sign-in, and after a failed one (with `?error=`).
	callbackURL: z.string(),
	errorCallbackURL: z.string().optional(),
});

export type SocialSignInRequest = z.infer<typeof socialSignInRequestSchema>;

export const socialSignInResponseSchema = z.object({
	url: z.url(),
	redirect: z.boolean(),
});

export type SocialSignInResponse = z.infer<typeof socialSignInResponseSchema>;

// GET /api/auth/get-session: the signed-in user, or null.
export const sessionUserSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	image: z.string().nullish(),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;

// `session.activeOrganizationId`: the organization this device is working in (organization plugin, 12.1). Null
// when it has none (its organization was deleted, or the session predates phase 12).
export const sessionResponseSchema = z
	.object({
		session: z.object({ activeOrganizationId: z.string().nullish() }),
		user: sessionUserSchema,
	})
	.nullable();

export type SessionResponse = z.infer<typeof sessionResponseSchema>;

// Better Auth's error body (its endpoints don't use our `{ error }` shape). `code` names the failure:
// "INVALID_OTP", "OTP_EXPIRED", "TOO_MANY_ATTEMPTS"...
export const authErrorResponseSchema = z.object({
	code: z.string(),
	message: z.string(),
});

export type AuthErrorResponse = z.infer<typeof authErrorResponseSchema>;

// POST /api/auth/email-otp/send-verification-otp: email a sign-in code. Answers the same whether the address
// has an account or not.
export const sendSignInCodeRequestSchema = z.object({
	email: z.email(),
	type: z.literal("sign-in"),
});

export type SendSignInCodeRequest = z.infer<typeof sendSignInCodeRequestSchema>;

export const sendSignInCodeResponseSchema = z.object({ success: z.boolean() });

// POST /api/auth/sign-in/email-otp: trade the code for a session (cookie). Creates the user on first sign-in.
export const emailCodeSignInRequestSchema = z.object({
	email: z.email(),
	otp: z.string(),
});

export type EmailCodeSignInRequest = z.infer<
	typeof emailCodeSignInRequestSchema
>;

export const emailCodeSignInResponseSchema = z.object({
	user: sessionUserSchema,
});

// POST /api/auth/sign-out.
export const signOutResponseSchema = z.object({ success: z.boolean() });

// POST /api/auth/delete-user (empty body): deletes the signed-in user, if their session is fresh (signed in
// within the last few minutes); otherwise 400 with code "SESSION_EXPIRED".
export const deleteAccountResponseSchema = z.object({
	success: z.boolean(),
	message: z.literal("User deleted"),
});
