// Routes reach Stripe only through this interface (Stripe adapter, or memory in tests). A test seam, not a
// promise that the provider can be swapped: ids are Stripe's and stored as such.
export type BillingDriver = {
	// Idempotent per organization.
	createCustomer(input: { organizationId: string }): Promise<string>;
	// The live subscription if any, else the newest ended one; null if never subscribed. Calls Stripe every time.
	currentSubscription(customerId: string): Promise<SubscriptionSnapshot | null>;
	createCheckoutSession(input: {
		customerId: string;
		organizationId: string;
		successUrl: string;
		cancelUrl: string;
	}): Promise<string>;
	createPortalSession(input: {
		customerId: string;
		returnUrl: string;
	}): Promise<string>;
	// Cancels the customer's subscriptions at once (no refund, no more invoices). No error if already deleted.
	deleteCustomer(customerId: string): Promise<void>;
};

export type SubscriptionSnapshot = {
	id: string;
	status: string;
	priceId: string;
	currentPeriodEnd: Date;
	cancelAtPeriodEnd: boolean;
};
