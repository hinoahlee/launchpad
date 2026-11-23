import { signInMethodsResponseSchema } from "@launchpad/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

// Not under /api/auth/*, which is all Better Auth's: it has no endpoint listing its providers.
export const signInMethodsRoutes =
	({ google }: { google: boolean }): FastifyPluginAsyncZod =>
	async (app) => {
		app.get(
			"/sign-in-methods",
			{ schema: { response: { 200: signInMethodsResponseSchema } } },
			async () => ({ google }),
		);
	};
