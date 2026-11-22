import { stripeEvents } from "@launchpad/db";
import { errorResponseSchema } from "@launchpad/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { BillingDriver } from "./driver.ts";
import { syncSubscription } from "./sync.ts";
import { verifyStripeEvent } from "./webhook-event.ts";

// The events that can change a subscription. Each one just triggers a sync: which one it was doesn't matter,
// since we save what Stripe says now, not what the event says. Subscribe the endpoint to exactly these.
export const SYNC_EVENTS: ReadonlySet<string> = new Set([
	"checkout.session.completed",
	"customer.subscription.created",
	"customer.subscription.updated",
	"customer.subscription.deleted",
	"customer.subscription.paused",
	"customer.subscription.resumed",
	"invoice.paid",
	"invoice.payment_failed",
]);

// POST /api/webhooks/stripe: Stripe calls it after each event the endpoint is subscribed to.
// - 400 on a bad signature (not from Stripe; nothing is recorded).
// - 204 once the event is handled, or was already handled, or isn't one we act on.
// - 500 if handling failed: nothing was saved, and Stripe retries (for up to 3 days), so the retry does it again.
export function stripeWebhookRoutes(
	billing: BillingDriver,
	secret: string,
): FastifyPluginAsyncZod {
	return async (app) => {
		// The signature covers the exact bytes Stripe sent, so this route takes the body as a Buffer, not parsed
		// JSON. Replaced only inside this plugin: every other route still gets parsed JSON.
		app.removeContentTypeParser("application/json");
		app.addContentTypeParser(
			"application/json",
			{ parseAs: "buffer" },
			(_request, body, done) => done(null, body),
		);

		app.post(
			"/webhooks/stripe",
			{
				// Stripe sends bursts from a few addresses (a busy minute, or retries after an outage). Throttling them
				// would only delay updates; the signature already keeps everyone else out.
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
						// Recorded first, committed with the sync below or not at all.
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
