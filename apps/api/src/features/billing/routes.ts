import {
	billingCustomers,
	billingSubscriptions,
	type Database,
} from "@launchpad/db";
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
import { type BillingDriver, isLive } from "./driver.ts";
import { syncSubscription } from "./sync.ts";

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

// Whether the organization has a subscription that hasn't ended, from our copy (kept current by webhooks).
async function subscribedOf(
	db: Database,
	organizationId: string,
): Promise<boolean> {
	const [row] = await db
		.select({ status: billingSubscriptions.status })
		.from(billingSubscriptions)
		.where(eq(billingSubscriptions.organizationId, organizationId));
	return row ? isLive(row.status) : false;
}

export const billingRoutes =
	(billing: BillingDriver | undefined, appUrl: string): FastifyPluginAsyncZod =>
	async (app) => {
		app.addHook("onRequest", requireSession);
		// Any member sees the plan; only owners and admins spend the organization's money.
		const member = requireMembership("member");
		const admin = requireMembership("admin");

		// From our database, not Stripe: fast, and works while Stripe is down. Right after a payment it may lag
		// until the webhook lands (eventual consistency); the page calls /billing/sync to catch up at once.
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
				return {
					enabled: billing !== undefined,
					subscribed: await subscribedOf(app.db, organizationId),
				};
			},
		);

		if (!billing) return;

		// Asks Stripe now instead of waiting for the webhook, then answers like GET. The page calls it when it lands
		// back from Checkout or the portal. Any member: it only refreshes our copy, and costs one Stripe request.
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
				return {
					enabled: true,
					subscribed: await subscribedOf(app.db, organizationId),
				};
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
				// A second checkout would start a second subscription, billed on top of the first. Synced first: right
				// after a payment, the webhook may not have landed yet, and our copy would still say "not subscribed".
				if (customerId) {
					const id = customerId;
					await app.db.transaction((tx) => syncSubscription(tx, billing, id));
					if (await subscribedOf(app.db, organizationId)) {
						reply.code(409);
						return { error: "already_subscribed" };
					}
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
					// Changes made there (cancel, new card) reach us by webhook; the marker makes the page sync at once.
					returnUrl: `${appUrl}/account?billing=updated`,
				});
				return { url };
			},
		);
	};
