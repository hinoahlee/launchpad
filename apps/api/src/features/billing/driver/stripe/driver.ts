import Stripe from "stripe";
import type { BillingDriver } from "../types.ts";
import { isLive } from "../utils.ts";
import { STRIPE_API_VERSION } from "./constants.ts";

type StripeDriverOptions = {
	apiKey: string;
	priceId: string;
	httpClient?: Stripe.HttpClient;
};

export function createStripeDriver({
	apiKey,
	priceId,
	httpClient,
}: StripeDriverOptions): BillingDriver {
	const stripe = new Stripe(apiKey, {
		apiVersion: STRIPE_API_VERSION,
		// Safe for creates: the SDK sends an idempotency key.
		maxNetworkRetries: 2,
		timeout: 20_000,
		...(httpClient && { httpClient }),
	});

	return {
		async createCustomer({ organizationId }) {
			const customer = await stripe.customers.create(
				{ metadata: { organizationId } },
				{ idempotencyKey: `customer-${organizationId}` },
			);
			return customer.id;
		},

		async currentSubscription(customerId) {
			// A newer abandoned subscription must not hide an older live one.
			const { data } = await stripe.subscriptions.list({
				customer: customerId,
				status: "all",
				limit: 10,
			});
			const subscription = data.find((s) => isLive(s.status)) ?? data[0];
			if (!subscription) return null;
			const [item] = subscription.items.data;
			if (!item) throw new Error(`subscription ${subscription.id}: no items`);
			return {
				id: subscription.id,
				status: subscription.status,
				priceId: item.price.id,
				currentPeriodEnd: new Date(item.current_period_end * 1000),
				cancelAtPeriodEnd: subscription.cancel_at_period_end,
			};
		},

		async createCheckoutSession({
			customerId,
			organizationId,
			successUrl,
			cancelUrl,
		}) {
			const session = await stripe.checkout.sessions.create({
				mode: "subscription",
				customer: customerId,
				line_items: [{ price: priceId, quantity: 1 }],
				client_reference_id: organizationId,
				subscription_data: { metadata: { organizationId } },
				success_url: successUrl,
				cancel_url: cancelUrl,
			});
			if (!session.url)
				throw new Error(`checkout session ${session.id}: no url`);
			return session.url;
		},

		async expireOpenCheckoutSessions(customerId) {
			const open = stripe.checkout.sessions.list({
				customer: customerId,
				status: "open",
				limit: 100,
			});
			for await (const session of open) {
				await stripe.checkout.sessions.expire(session.id);
			}
		},

		async createPortalSession({ customerId, returnUrl }) {
			const session = await stripe.billingPortal.sessions.create({
				customer: customerId,
				return_url: returnUrl,
			});
			return session.url;
		},

		async deleteCustomer(customerId) {
			try {
				await stripe.customers.del(customerId);
			} catch (err) {
				if (
					err instanceof Stripe.errors.StripeError &&
					err.code === "resource_missing"
				) {
					return;
				}
				throw err;
			}
		},
	};
}
