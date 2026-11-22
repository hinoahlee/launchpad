import { billingCustomers, type Database } from "@launchpad/db";
import {
	billingRedirectResponseSchema,
	billingResponseSchema,
	errorResponseSchema,
	organizationParamsSchema,
} from "@launchpad/shared";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
	membershipOf,
	requireMembership,
} from "#features/auth/require-membership.ts";
import { requireSession } from "#features/auth/require-session.ts";
import type { BillingDriver } from "./driver.ts";

async function customerIdOf(
	db: Database,
	organizationId: string,
): Promise<string | undefined> {
	const [row] = await db
		.select({ id: billingCustomers.stripeCustomerId })
		.from(billingCustomers)
		.where(eq(billingCustomers.organizationId, organizationId));
	return row?.id;
}

// /api/organizations/:organizationId/billing: the organization's plan, and the two Stripe pages that change it.
// Payment details never touch the API: Checkout and the Customer Portal are Stripe's own pages, and the API only
// creates a session for one and sends the browser there.
// `billing` undefined (no Stripe settings): only GET, which says billing is off.
export const billingRoutes =
	(billing: BillingDriver | undefined, appUrl: string): FastifyPluginAsyncZod =>
	async (app) => {
		app.addHook("onRequest", requireSession);
		// Any member sees the plan; only owners and admins spend the organization's money.
		const member = requireMembership("member");
		const admin = requireMembership("admin");

		// Asks Stripe each time for now; webhooks (13.3) will keep a copy in our database instead.
		app.get(
			"/billing",
			{
				preHandler: member,
				schema: {
					params: organizationParamsSchema,
					response: { 200: billingResponseSchema },
				},
			},
			async (request) => {
				const { organizationId } = membershipOf(request);
				if (!billing) return { enabled: false, subscribed: false };
				const customerId = await customerIdOf(app.db, organizationId);
				return {
					enabled: true,
					subscribed: customerId
						? await billing.hasLiveSubscription(customerId)
						: false,
				};
			},
		);

		if (!billing) return;

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
				// A second checkout would start a second subscription, billed on top of the first.
				if (customerId && (await billing.hasLiveSubscription(customerId))) {
					reply.code(409);
					return { error: "already_subscribed" };
				}
				if (!customerId) {
					// Two requests at once both get here, and Stripe returns the same customer to both (idempotency
					// key): the second insert finds the row there and changes nothing.
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
					returnUrl: `${appUrl}/account`,
				});
				return { url };
			},
		);
	};
