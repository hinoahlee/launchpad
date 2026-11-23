import { sessions } from "@launchpad/db";
import {
	accountSessionParamsSchema,
	accountSessionsResponseSchema,
	errorResponseSchema,
} from "@launchpad/shared";
import { and, desc, eq, gt } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireSession, sessionOf } from "#lib/auth/guards/require-session.ts";

// Every query filters on the session's user id: that filter is the authorization.
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

	// Deleting the row signs that device out on its next request.
	app.delete(
		"/account/sessions/:id",
		{
			schema: {
				params: accountSessionParamsSchema,
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
			// Another user's session: 404, not 403, so ids can't be probed.
			if (deleted.length === 0) {
				reply.code(404);
				return { error: "not_found" };
			}
			reply.code(204);
			return null;
		},
	);
};
