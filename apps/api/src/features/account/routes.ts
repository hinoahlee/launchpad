import { sessions } from "@launchpad/db";
import {
	accountSessionParamsSchema,
	accountSessionsResponseSchema,
	errorResponseSchema,
} from "@launchpad/shared";
import { and, desc, eq, gt } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireSession, sessionOf } from "#features/auth/require-session.ts";

// The signed-in user's own account: /api/account/*. Every route here needs a session (the hook), and every
// query is limited to that session's user (authorization): the `userId` filter is what stops user A from
// reading or deleting user B's rows, so each query must have it.
export const accountRoutes: FastifyPluginAsyncZod = async (app) => {
	app.addHook("onRequest", requireSession);

	app.get(
		"/account/sessions",
		{ schema: { response: { 200: accountSessionsResponseSchema } } },
		async (request) => {
			const { user, session } = sessionOf(request);
			const rows = await app.db
				.select()
				.from(sessions)
				.where(
					and(eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date())),
				)
				.orderBy(desc(sessions.updatedAt));
			return {
				sessions: rows.map((row) => ({
					id: row.id,
					createdAt: row.createdAt.toISOString(),
					lastActiveAt: row.updatedAt.toISOString(),
					userAgent: row.userAgent,
					ipAddress: row.ipAddress,
					current: row.id === session.id,
				})),
			};
		},
	);

	// Session revocation: deleting the row signs that device out on its next request.
	app.delete(
		"/account/sessions/:id",
		{
			schema: {
				params: accountSessionParamsSchema,
				// 204: done, no body.
				response: { 204: z.null(), 404: errorResponseSchema },
			},
		},
		async (request, reply) => {
			const { user } = sessionOf(request);
			const deleted = await app.db
				.delete(sessions)
				.where(
					and(eq(sessions.id, request.params.id), eq(sessions.userId, user.id)),
				)
				.returning({ id: sessions.id });
			// Someone else's session gets the same 404 as one that doesn't exist (not 403): the answer doesn't
			// tell a stranger that the id is real.
			if (deleted.length === 0) {
				reply.code(404);
				return { error: "not_found" };
			}
			reply.code(204);
			return null;
		},
	);
};
