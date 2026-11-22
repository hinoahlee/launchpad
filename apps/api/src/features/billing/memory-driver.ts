import type { BillingDriver, SubscriptionSnapshot } from "./driver.ts";

// Stands in for Stripe in tests. Its URLs point nowhere: a test "pays" with `subscribe`, since Checkout itself
// happens between the browser and Stripe.
export const MEMORY_BILLING_ORIGIN = "https://stripe.billing.test";
export const MEMORY_PRICE_ID = "price_memory";

export type MemoryBillingDriver = BillingDriver & {
	// Customer id → the organization it was made for. Like Stripe's idempotency key: one per organization.
	customers: Map<string, string>;
	// Each customer's subscription, as currentSubscription returns it.
	subscriptions: Map<string, SubscriptionSnapshot>;
	// What paying at Checkout would leave at Stripe (an active monthly subscription), with any field changed.
	subscribe(customerId: string, changes?: Partial<SubscriptionSnapshot>): void;
	// How many times the API asked for a subscription (a duplicate webhook shouldn't).
	fetches: number;
	// The next `n` subscription requests fail, like Stripe being down mid-webhook.
	failNext(n?: number): void;
	// Clears everything (between tests).
	reset(): void;
};

export function createMemoryBillingDriver(): MemoryBillingDriver {
	const customers = new Map<string, string>();
	const subscriptions = new Map<string, SubscriptionSnapshot>();
	let failures = 0;
	const driver: MemoryBillingDriver = {
		customers,
		subscriptions,
		fetches: 0,
		subscribe(customerId, changes = {}) {
			subscriptions.set(customerId, {
				id: `sub_${customerId.slice(4)}`,
				status: "active",
				priceId: MEMORY_PRICE_ID,
				currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
				cancelAtPeriodEnd: false,
				...changes,
			});
		},
		failNext(n = 1) {
			failures = n;
		},
		reset() {
			customers.clear();
			subscriptions.clear();
			failures = 0;
			driver.fetches = 0;
		},
		async createCustomer({ organizationId }) {
			const id = `cus_${organizationId.replaceAll("-", "")}`;
			customers.set(id, organizationId);
			return id;
		},
		async currentSubscription(customerId) {
			driver.fetches += 1;
			if (failures > 0) {
				failures -= 1;
				throw new Error("stripe unavailable (memory driver)");
			}
			return subscriptions.get(customerId) ?? null;
		},
		async createCheckoutSession({ customerId, successUrl }) {
			const url = new URL(`${MEMORY_BILLING_ORIGIN}/checkout`);
			url.searchParams.set("customer", customerId);
			url.searchParams.set("success_url", successUrl);
			return url.toString();
		},
		async createPortalSession({ customerId, returnUrl }) {
			const url = new URL(`${MEMORY_BILLING_ORIGIN}/portal`);
			url.searchParams.set("customer", customerId);
			url.searchParams.set("return_url", returnUrl);
			return url.toString();
		},
	};
	return driver;
}
