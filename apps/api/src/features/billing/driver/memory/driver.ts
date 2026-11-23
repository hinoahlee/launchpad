import type { BillingDriver, SubscriptionSnapshot } from "../types.ts";
import { MEMORY_BILLING_ORIGIN, MEMORY_PRICE_ID } from "./constants.ts";

type MemoryBillingDriver = BillingDriver & {
	// Customer id → organization id.
	customers: Map<string, string>;
	subscriptions: Map<string, SubscriptionSnapshot>;
	// What paying at Checkout leaves at Stripe: an active subscription.
	subscribe(customerId: string, changes?: Partial<SubscriptionSnapshot>): void;
	// currentSubscription calls.
	fetches: number;
	// The next `n` currentSubscription or deleteCustomer calls throw.
	failNext(n?: number): void;
	reset(): void;
};

// Stripe stand-in for tests. Its URLs point nowhere: a test "pays" with `subscribe`.
export function createMemoryBillingDriver(): MemoryBillingDriver {
	const customers = new Map<string, string>();
	const subscriptions = new Map<string, SubscriptionSnapshot>();
	let failures = 0;
	const failIfAsked = () => {
		if (failures > 0) {
			failures -= 1;
			throw new Error("stripe unavailable (memory driver)");
		}
	};
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
			failIfAsked();
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
		async deleteCustomer(customerId) {
			failIfAsked();
			customers.delete(customerId);
			subscriptions.delete(customerId);
		},
	};
	return driver;
}
