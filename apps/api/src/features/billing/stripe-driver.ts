import Stripe from "stripe";
import { type BillingDriver, ENDED_STATUSES } from "./driver.ts";

// The Stripe API version our code is written against. Stripe changes response shapes between versions, so it's
// pinned here, not taken from the account's default. It must be the version this SDK release's types describe
// (the type check fails otherwise): upgrading the `stripe` package is a deliberate step that updates it.
export const STRIPE_API_VERSION = "2026-10-28.endive";

export type StripeDriverOptions = {
	apiKey: string;
	// The one price Checkout sells (STRIPE_PRICE_ID).
	priceId: string;
	// Tests swap the network for a fake (Stripe.createFetchHttpClient).
	httpClient?: Stripe.HttpClient;
};

export function createStripeDriver({
	apiKey,
	priceId,
	httpClient,
}: StripeDriverOptions): BillingDriver {
	const stripe = new Stripe(apiKey, {
		apiVersion: STRIPE_API_VERSION,
		// Retries a failed connection or a 5xx twice. Safe for creates: the SDK sends an idempotency key, so a
		// retried POST that had reached Stripe returns the first result instead of creating a second object.
		maxNetworkRetries: 2,
		// Stripe answers in well under a second; a request still open after 20 s won't succeed.
		timeout: 20_000,
		...(httpClient && { httpClient }),
	});

	return {
		async createCustomer({ organizationId }) {
			const customer = await stripe.customers.create(
				{ metadata: { organizationId } },
				// Stripe keeps a key's answer for 24 hours. Two requests for one organization (a double click, two
				// tabs) get the same customer; by the next day, its id is in billing_customers.
				{ idempotencyKey: `customer-${organizationId}` },
			);
			return customer.id;
		},

		async hasLiveSubscription(customerId) {
			// Newest first. An organization has at most a few, so 10 covers the live one.
			const subscriptions = await stripe.subscriptions.list({
				customer: customerId,
				status: "all",
				limit: 10,
			});
			return subscriptions.data.some((s) => !ENDED_STATUSES.has(s.status));
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
				// Which organization paid, on the session and on the subscription it creates: webhooks (13.3) can
				// check it against billing_customers.
				client_reference_id: organizationId,
				subscription_data: { metadata: { organizationId } },
				success_url: successUrl,
				cancel_url: cancelUrl,
			});
			if (!session.url)
				throw new Error(`checkout session ${session.id}: no url`);
			return session.url;
		},

		async createPortalSession({ customerId, returnUrl }) {
			const session = await stripe.billingPortal.sessions.create({
				customer: customerId,
				return_url: returnUrl,
			});
			return session.url;
		},
	};
}
