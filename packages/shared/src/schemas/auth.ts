import { z } from "zod";

// Better Auth's endpoints (/api/auth/*): only the fields the web app reads. API tests check its answers match.

// POST /api/auth/sign-in/social
export const socialSignInRequestSchema = z.object({
	provider: z.literal("google"),
	callbackURL: z.string(),
	errorCallbackURL: z.string().optional(),
});

export type SocialSignInRequest = z.infer<typeof socialSignInRequestSchema>;

export const socialSignInResponseSchema = z.object({
	url: z.url(),
	redirect: z.boolean(),
});

export type SocialSignInResponse = z.infer<typeof socialSignInResponseSchema>;

// GET /api/auth/get-session: null when signed out.
export const sessionUserSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	image: z.string().nullish(),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;

export const sessionResponseSchema = z
	.object({
		session: z.object({ activeOrganizationId: z.string().nullish() }),
		user: sessionUserSchema,
	})
	.nullable();

export type SessionResponse = z.infer<typeof sessionResponseSchema>;

// Better Auth's error body (not our `{ error }` shape): `code` is "INVALID_OTP", "OTP_EXPIRED"...
export const authErrorResponseSchema = z.object({
	code: z.string(),
	message: z.string(),
});

export type AuthErrorResponse = z.infer<typeof authErrorResponseSchema>;

// POST /api/auth/email-otp/send-verification-otp
export const sendSignInCodeRequestSchema = z.object({
	email: z.email(),
	type: z.literal("sign-in"),
});

export type SendSignInCodeRequest = z.infer<typeof sendSignInCodeRequestSchema>;

export const sendSignInCodeResponseSchema = z.object({ success: z.boolean() });

// POST /api/auth/sign-in/email-otp: creates the user on first sign-in.
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

// POST /api/auth/delete-user (empty body). A session that isn't recent: 400 "SESSION_EXPIRED".
export const deleteAccountResponseSchema = z.object({
	success: z.boolean(),
	message: z.literal("User deleted"),
});
