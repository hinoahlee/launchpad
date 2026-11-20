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

export const sessionResponseSchema = z
	.object({ user: sessionUserSchema })
	.nullable();

export type SessionResponse = z.infer<typeof sessionResponseSchema>;

// POST /api/auth/sign-out.
export const signOutResponseSchema = z.object({ success: z.boolean() });
