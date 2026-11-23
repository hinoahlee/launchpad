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
						syncSubscription(tx, billing, customerId),
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
				// A second checkout would bill a second subscription. Synced first: the webhook may not have landed.
				if (customerId) {
					const id = customerId;
					await app.db.transaction((tx) => syncSubscription(tx, billing, id));
					if (await subscribedOf(app.db, organizationId)) {
						reply.code(409);
						return { error: "already_subscribed" };
					}
				}
				if (!customerId) {
					// Concurrent requests get the same customer from Stripe (idempotency key); the second insert is a no-op.
					customerId = await billing.createCustomer({ organizationId });
					await app.db
						.insert(billingCustomers)
						.values({ organizationId, stripeCustomerId: customerId })
						.onConflictDoNothing({ target: billingCustomers.organizationId });
				}
				const url = await billing.createCheckoutSession({
					customerId,
					organizationId,
					successUrl: `${appUrl}/account?billing=success`,
					cancelUrl: `${appUrl}/account`,
				});
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
