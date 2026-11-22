import Stripe from "stripe";

// What the webhook needs from a Stripe event. The rest of the payload is deliberately ignored: it's a snapshot from
// when the event happened, possibly older than another event we already handled. We re-fetch instead (sync.ts).
export type StripeEventSummary = {
	id: string;
	type: string;
	// The customer the event is about, when it has one ("cus_...").
	customerId: string | undefined;
};

// Checks the `Stripe-Signature` header against the raw body: an HMAC of the exact bytes, made with the endpoint's
// signing secret, plus a timestamp (older than 5 minutes is refused, so a captured request can't be replayed
// later). Returns null when it doesn't match. Local crypto only: no request to Stripe.
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

// Subscription, invoice and checkout session events all carry `customer`, as an id or, if expanded, an object.
function customerOf(event: Stripe.Event): string | undefined {
	const customer: unknown = (event.data.object as { customer?: unknown })
		.customer;
	if (typeof customer === "string") return customer;
	if (customer && typeof customer === "object" && "id" in customer) {
		return typeof customer.id === "string" ? customer.id : undefined;
	}
	return undefined;
}
