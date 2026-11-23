import { z } from "zod";

// GET /api/account/sessions. Ids only, never tokens: a token is a login.
export const accountSessionSchema = z.object({
	id: z.uuid(),
	createdAt: z.iso.datetime(),
	lastActiveAt: z.iso.datetime(),
	userAgent: z.string().nullable(),
	ipAddress: z.string().nullable(),
	// The session this request came with.
	current: z.boolean(),
});

export type AccountSession = z.infer<typeof accountSessionSchema>;

export const accountSessionsResponseSchema = z.object({
	sessions: z.array(accountSessionSchema),
});

export type AccountSessionsResponse = z.infer<
	typeof accountSessionsResponseSchema
>;

// DELETE /api/account/sessions/:id
export const accountSessionParamsSchema = z.object({ id: z.uuid() });
