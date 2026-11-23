import Stripe from "stripe";

// The payload is deliberately ignored (it may be older than state we already saved): service.ts re-fetches.
type StripeEventSummary = {
	id: string;
	type: string;
	customerId: string | undefined;
};

// HMAC of the raw body, with a 5-minute replay window. Local only: no request to Stripe. null: not genuine.
export function verifyStripeEvent(
	rawBody: Buffer,
	signature: string | undefined,
	secret: string,
): StripeEventSummary | null {
	if (!signature) return null;
	let event: Stripe.Event;
	try {
		event = Stripe.webhooks.constructEvent(rawBody, signature, secret);
	} catch {
		return null;
	}
	return { id: event.id, type: event.type, customerId: customerOf(event) };
}

// `customer` is an id, or an object when expanded.
function customerOf(event: Stripe.Event): string | undefined {
	const customer: unknown = (event.data.object as { customer?: unknown })
		.customer;
	if (typeof customer === "string") return customer;
	if (customer && typeof customer === "object" && "id" in customer) {
		return typeof customer.id === "string" ? customer.id : undefined;
	}
	return undefined;
}
