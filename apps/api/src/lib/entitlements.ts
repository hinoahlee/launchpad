import {
	billingSubscriptions,
	type Database,
	type Transaction,
} from "@launchpad/db";
import { ENTITLEMENTS, type Entitlements, type Plan } from "@launchpad/shared";
import { eq } from "drizzle-orm";

// `past_due` keeps access while Stripe retries the card. Canceled "at period end" stays `active` until then.
const PAID_STATUSES: ReadonlySet<string> = new Set([
	"active",
	"trialing",
	"past_due",
]);

// One paid plan. With several prices, map `priceId` here.
export function planFor(status: string | undefined): Plan {
	return status !== undefined && PAID_STATUSES.has(status) ? "pro" : "free";
}

// Inside a transaction, pass `tx`, so the check and the write it allows see the same data.
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

// Gate features on this, never on the plan's name. Limits: ENTITLEMENTS in @launchpad/shared.
export async function entitlementsOf(
	db: Database | Transaction,
	organizationId: string,
): Promise<Entitlements> {
	return ENTITLEMENTS[await planOf(db, organizationId)];
}
