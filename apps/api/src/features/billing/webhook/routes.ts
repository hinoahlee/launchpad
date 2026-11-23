import { stripeEvents } from "@launchpad/db";
import { errorResponseSchema } from "@launchpad/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { BillingDriver } from "../driver/types.ts";
import { syncSubscription } from "../service.ts";
import { SYNC_EVENTS } from "./constants.ts";
import { verifyStripeEvent } from "./verify-event.ts";

// 400: bad signature. 204: handled, a duplicate, or ignored. 500: nothing saved, and Stripe retries.
export function stripeWebhookRoutes(
	billing: BillingDriver,
	secret: string,
): FastifyPluginAsyncZod {
	return async (app) => {
		// The signature covers the raw bytes. Scoped to this plugin.
		app.removeContentTypeParser("application/json");
		app.addContentTypeParser(
			"application/json",
			{ parseAs: "buffer" },
			(_request, body, done) => done(null, body),
		);

		app.post(
			"/webhooks/stripe",
			{
				// Signed, and sent in bursts from a few IPs: throttling would only delay updates.
				config: { rateLimit: false },
				schema: {
					body: z.instanceof(Buffer),
					response: {
						204: z.undefined(),
						400: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			},
			async (request, reply) => {
				const header = request.headers["stripe-signature"];
				const event = verifyStripeEvent(
					request.body,
					typeof header === "string" ? header : undefined,
					secret,
				);
				if (!event) {
					request.log.warn("stripe webhook: bad or missing signature");
					return reply.code(400).send({ error: "invalid_signature" });
				}
				const log = request.log.child({
					eventId: event.id,
					eventType: event.type,
				});
				if (!SYNC_EVENTS.has(event.type) || !event.customerId) {
					log.info("stripe webhook: ignored");
					return reply.code(204).send();
				}
				const { customerId } = event;

				try {
					const result = await app.db.transaction(async (tx) => {
						// Committed with the sync, or not at all: a retry after a failure runs again.
						const [fresh] = await tx
							.insert(stripeEvents)
							.values({ id: event.id, type: event.type })
							.onConflictDoNothing()
							.returning({ id: stripeEvents.id });
						if (!fresh) return "duplicate" as const;
						return syncSubscription(tx, billing, customerId);
					});
					log.info({ result }, "stripe webhook");
				} catch (err) {
					log.error({ err }, "stripe webhook: failed; Stripe will retry");
					return reply.code(500).send({ error: "webhook_failed" });
				}
				return reply.code(204).send();
			},
		);
	};
}
