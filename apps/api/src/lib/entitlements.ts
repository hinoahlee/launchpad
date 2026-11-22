import {
	billingSubscriptions,
	type Database,
	type Transaction,
} from "@launchpad/db";
import { ENTITLEMENTS, type Entitlements, type Plan } from "@launchpad/shared";
import { eq } from "drizzle-orm";

// Subscription statuses that get the paid plan. `past_due`: a renewal failed and Stripe is retrying the card (for
// up to a few weeks, per the account's settings); access stays while it does, so a card about to be updated doesn't
// lock anyone out. Every other status means no paid access: `incomplete` (first payment not done), `unpaid` (retries
// ran out), `paused`, `canceled`, `incomplete_expired`. A subscription canceled "at period end" stays `active` until
// that end, so it keeps access for the time already paid.
const PAID_STATUSES: ReadonlySet<string> = new Set([
	"active",
	"trialing",
	"past_due",
]);

// One paid plan: any subscription with a paid status is Pro. With several prices, map `priceId` here instead.
export function planFor(status: string | undefined): Plan {
	return status !== undefined && PAID_STATUSES.has(status) ? "pro" : "free";
}

// The organization's plan, from our copy of its subscription (kept current by Stripe's webhooks, 13.3). No row:
// it never subscribed, or billing is off. Inside a transaction, pass `tx` so the check and the write it allows see
// the same data.
export async function planOf(
	db: Database | Transaction,
	organizationId: string,
): Promise<Plan> {
	const [row] = await db
		.select({ status: billingSubscriptions.status })
		.from(billingSubscriptions)
		.where(eq(billingSubscriptions.organizationId, organizationId));
	return planFor(row?.status);
}

// What the organization may do now. Features gate on this, never on the plan's name, so changing what a plan
// includes is one edit in @launchpad/shared (plans.ts).
export async function entitlementsOf(
	db: Database | Transaction,
	organizationId: string,
): Promise<Entitlements> {
	return ENTITLEMENTS[await planOf(db, organizationId)];
}
