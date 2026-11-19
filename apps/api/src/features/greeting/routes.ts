import { greetingQuerySchema, greetingResponseSchema } from "@launchpad/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

export const greetingRoutes: FastifyPluginAsyncZod = async (app) => {
	app.get(
		"/greeting",
		{
			// `querystring` validates the request (bad input → 400 validation_failed) and types `request.query`.
			// `response` types the handler's return value and drops any field the schema doesn't list.
			schema: {
				querystring: greetingQuerySchema,
				response: { 200: greetingResponseSchema },
			},
		},
		async (request) => ({ message: `Hello, ${request.query.name}!` }),
	);
};
