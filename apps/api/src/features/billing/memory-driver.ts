import type { BillingDriver } from "./driver.ts";

// Stands in for Stripe in tests. Its URLs point nowhere: a test "pays" with `subscribe`, since Checkout itself
// happens between the browser and Stripe.
export const MEMORY_BILLING_ORIGIN = "https://stripe.billing.test";

export type MemoryBillingDriver = BillingDriver & {
	// Customer id → the organization it was made for. Like Stripe's idempotency key: one per organization.
	customers: Map<string, string>;
	// Customers with a subscription that hasn't ended.
	subscribed: Set<string>;
	// What paying at Checkout would leave at Stripe.
	subscribe(customerId: string): void;
	// Clears everything (between tests).
	reset(): void;
};

export function createMemoryBillingDriver(): MemoryBillingDriver {
	const customers = new Map<string, string>();
	const subscribed = new Set<string>();
	return {
		customers,
		subscribed,
		subscribe(customerId) {
			subscribed.add(customerId);
		},
		reset() {
			customers.clear();
			subscribed.clear();
		},
		async createCustomer({ organizationId }) {
			const id = `cus_${organizationId.replaceAll("-", "")}`;
			customers.set(id, organizationId);
			return id;
		},
		async hasLiveSubscription(customerId) {
			return subscribed.has(customerId);
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
}
