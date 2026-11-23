import { greetingQuerySchema, greetingResponseSchema } from "@launchpad/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

export const greetingRoutes: FastifyPluginAsyncZod = async (app) => {
	app.get(
		"/greeting",
		{
			schema: {
				querystring: greetingQuerySchema,
				response: { 200: greetingResponseSchema },
			},
		},
		async (request) => ({ message: `Hello, ${request.query.name}!` }),
	);
};
