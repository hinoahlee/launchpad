// The one interface the API reaches Stripe through: routes depend on this, never on the Stripe SDK, so their tests
// run against the in-memory driver instead of Stripe. It's a seam for tests, not a promise that Stripe can be
// swapped: unlike a bucket, a billing provider holds customers, cards and subscriptions, and moving them is a
// migration. So the ids it returns are Stripe's, stored as such (billing_customers.stripe_customer_id).
export type BillingDriver = {
	// A new Stripe customer for the organization, "cus_...". Asking twice for the same organization returns the
	// same customer (an idempotency key), so two checkouts started at once don't make two.
	createCustomer(input: { organizationId: string }): Promise<string>;
	// The customer's subscription as Stripe has it now: the one that hasn't ended if there is one, else the newest
	// ended one; null if they never subscribed. A real request to Stripe, every time.
	currentSubscription(customerId: string): Promise<SubscriptionSnapshot | null>;
	// A Stripe Checkout page that subscribes the customer to the plan's price. Returns its URL.
	createCheckoutSession(input: {
		customerId: string;
		organizationId: string;
		successUrl: string;
		cancelUrl: string;
	}): Promise<string>;
	// A Customer Portal page (change card, cancel, invoices) for the customer. Returns its URL.
	createPortalSession(input: {
		customerId: string;
		returnUrl: string;
	}): Promise<string>;
};

export type SubscriptionSnapshot = {
	id: string;
	status: string;
	priceId: string;
	currentPeriodEnd: Date;
	cancelAtPeriodEnd: boolean;
};

// Every other status is a subscription the customer still has, and manages in the portal.
export const ENDED_STATUSES: ReadonlySet<string> = new Set([
	"canceled",
	"incomplete_expired",
]);

export const isLive = (status: string) => !ENDED_STATUSES.has(status);
