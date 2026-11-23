// Subscribe the Stripe endpoint to exactly these. Each one only triggers a sync (service.ts).
export const SYNC_EVENTS: ReadonlySet<string> = new Set([
	"checkout.session.completed",
	"customer.subscription.created",
	"customer.subscription.updated",
	"customer.subscription.deleted",
	"customer.subscription.paused",
	"customer.subscription.resumed",
	"invoice.paid",
	"invoice.payment_failed",
]);
