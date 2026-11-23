import type { Database } from "@launchpad/db";
import {
	errorResponseSchema,
	healthResponseSchema,
	versionResponseSchema,
} from "@launchpad/shared";
import { sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	let timer: NodeJS.Timeout | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export const probeRoutes =
	({
		db,
		gitSha,
		readyTimeoutMs,
	}: {
		db: Database;
		gitSha: string;
		readyTimeoutMs: number;
	}): FastifyPluginAsyncZod =>
	async (app) => {
		// Liveness: never checks dependencies, since a restart doesn't fix a database outage.
		app.get(
			"/health",
			{ schema: { response: { 200: healthResponseSchema } } },
			async () => ({ status: "ok" as const }),
		);

		app.get(
			"/ready",
			{
				schema: {
					response: { 200: healthResponseSchema, 503: errorResponseSchema },
				},
			},
			async (request, reply) => {
				try {
					await withTimeout(db.execute(sql`select 1`), readyTimeoutMs);
					return { status: "ok" as const };
				} catch (err) {
					request.log.warn({ err }, "readiness check failed");
					reply.code(503);
					return { error: "database_unavailable" };
				}
			},
		);

		// The deploy job polls this until it reports the commit it deployed.
		app.get(
			"/version",
			{ schema: { response: { 200: versionResponseSchema } } },
			async () => ({ sha: gitSha }),
		);
	};
