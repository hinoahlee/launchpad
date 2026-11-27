import { billingCustomers } from "@launchpad/db";
import {
	billingRedirectResponseSchema,
	billingResponseSchema,
	errorResponseSchema,
	organizationParamsSchema,
} from "@launchpad/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
	membershipOf,
	requireMembership,
} from "#lib/auth/guards/require-membership.ts";
import { requireSession } from "#lib/auth/guards/require-session.ts";
import type { BillingDriver } from "./driver/types.ts";
import {
	billingStatus,
	customerIdOf,
	subscribedOf,
	syncSubscription,
} from "./service.ts";

// Payment details never touch the API: it only creates Stripe Checkout and Customer Portal sessions.
// Without Stripe settings (`billing` undefined) only GET exists, and says billing is off.
export const billingRoutes =
	(billing: BillingDriver | undefined, appUrl: string): FastifyPluginAsyncZod =>
	async (app) => {
		app.addHook("onRequest", requireSession);
		const member = requireMembership("member");
		const admin = requireMembership("admin");

		// From our copy, not Stripe: it can lag a webhook behind, so the page calls /billing/sync after a payment.
		app.get(
			"/billing",
			{
				preHandler: member,
				schema: {
					params: organizationParamsSchema,
					response: { 200: billingResponseSchema },
				},
			},
			async (request) =>
				billingStatus(
					app.db,
					membershipOf(request).organizationId,
					billing !== undefined,
				),
		);

		if (!billing) return;

		app.post(
			"/billing/sync",
			{
				preHandler: member,
				schema: {
					params: organizationParamsSchema,
					response: { 200: billingResponseSchema },
				},
			},
			async (request) => {
				const { organizationId } = membershipOf(request);
				const customerId = await customerIdOf(app.db, organizationId);
				if (customerId) {
					await app.db.transaction((tx) =>
						syncSubscription(tx, billing, customerId, { wait: false }),
					);
				}
				return billingStatus(app.db, organizationId, true);
			},
		);

		app.post(
			"/billing/checkout",
			{
				preHandler: admin,
				schema: {
					params: organizationParamsSchema,
					response: {
						200: billingRedirectResponseSchema,
						409: errorResponseSchema,
					},
				},
			},
			async (request, reply) => {
				const { organizationId } = membershipOf(request);
				let customerId = await customerIdOf(app.db, organizationId);
				if (!customerId) {
					// Concurrent requests get the same customer from Stripe (idempotency key); the second insert is a no-op.
					customerId = await billing.createCustomer({ organizationId });
					await app.db
						.insert(billingCustomers)
						.values({ organizationId, stripeCustomerId: customerId })
						.onConflictDoNothing({ target: billingCustomers.organizationId });
				}
				const id = customerId;
				// A second paid checkout would bill a second subscription. Under the customer row's lock, so two
				// clicks run one after the other: synced first (the webhook may not have landed), then any session
				// still open in another tab is expired, so only the newest one can be paid.
				const url = await app.db.transaction(async (tx) => {
					await syncSubscription(tx, billing, id);
					if (await subscribedOf(tx, organizationId)) return undefined;
					await billing.expireOpenCheckoutSessions(id);
					return billing.createCheckoutSession({
						customerId: id,
						organizationId,
						successUrl: `${appUrl}/account?billing=success`,
						cancelUrl: `${appUrl}/account`,
					});
				});
				if (!url) {
					reply.code(409);
					return { error: "already_subscribed" };
				}
				return { url };
			},
		);

		app.post(
			"/billing/portal",
			{
				preHandler: admin,
				schema: {
					params: organizationParamsSchema,
					response: {
						200: billingRedirectResponseSchema,
						409: errorResponseSchema,
					},
				},
			},
			async (request, reply) => {
				const { organizationId } = membershipOf(request);
				const customerId = await customerIdOf(app.db, organizationId);
				if (!customerId) {
					reply.code(409);
					return { error: "no_billing_account" };
				}
				const url = await billing.createPortalSession({
					customerId,
					returnUrl: `${appUrl}/account?billing=updated`,
				});
				return { url };
			},
		);
	};
