// The one interface the API reaches Stripe through (like lib/storage's StorageDriver): routes depend on this,
// never on the Stripe SDK. The Stripe adapter calls the real API; tests use the in-memory one.
export type BillingDriver = {
	// A new Stripe customer for the organization, "cus_...". Asking twice for the same organization returns the
	// same customer (an idempotency key), so two checkouts started at once don't make two.
	createCustomer(input: { organizationId: string }): Promise<string>;
	// Whether the customer has a subscription that hasn't ended (active, trialing, past due, unpaid, paused).
	hasLiveSubscription(customerId: string): Promise<boolean>;
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

// Every other status is a subscription the customer still has, and manages in the portal.
export const ENDED_STATUSES: ReadonlySet<string> = new Set([
	"canceled",
	"incomplete_expired",
]);
