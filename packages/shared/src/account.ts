import { z } from "zod";

// GET /api/account/sessions: the signed-in user's sessions (one per device or browser), newest activity first.
// Ids only, never tokens: a token is a login, and page scripts never need another device's.
export const accountSessionSchema = z.object({
	id: z.uuid(),
	createdAt: z.iso.datetime(),
	// When it was last renewed (Better Auth pushes the expiry forward at most once a day while it's used).
	lastActiveAt: z.iso.datetime(),
	userAgent: z.string().nullable(),
	ipAddress: z.string().nullable(),
	// The session this request came with: "this device".
	current: z.boolean(),
});

export type AccountSession = z.infer<typeof accountSessionSchema>;

export const accountSessionsResponseSchema = z.object({
	sessions: z.array(accountSessionSchema),
});

export type AccountSessionsResponse = z.infer<
	typeof accountSessionsResponseSchema
>;

// DELETE /api/account/sessions/:id: sign that device out (204). 404 if it isn't one of yours.
export const accountSessionParamsSchema = z.object({ id: z.uuid() });
