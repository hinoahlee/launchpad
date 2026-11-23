import {
	billingCustomers,
	billingSubscriptions,
	type Database,
	type Transaction,
} from "@launchpad/db";
import type { BillingResponse } from "@launchpad/shared";
import { eq } from "drizzle-orm";
import { planOf } from "#lib/entitlements.ts";
import type { BillingDriver } from "./driver/types.ts";
import { isLive } from "./driver/utils.ts";

export async function customerIdOf(
	db: Database,
	organizationId: string,
): Promise<string | undefined> {
	const [row] = await db
		.select({ id: billingCustomers.stripeCustomerId })
		.from(billingCustomers)
		.where(eq(billingCustomers.organizationId, organizationId));
	return row?.id;
}

// A subscription that hasn't ended, from our copy (kept current by the webhook).
export async function subscribedOf(
	db: Database,
	organizationId: string,
): Promise<boolean> {
	const [row] = await db
		.select({ status: billingSubscriptions.status })
		.from(billingSubscriptions)
		.where(eq(billingSubscriptions.organizationId, organizationId));
	return row ? isLive(row.status) : false;
}

export async function billingStatus(
	db: Database,
	organizationId: string,
	enabled: boolean,
): Promise<BillingResponse> {
	return {
		enabled,
		subscribed: await subscribedOf(db, organizationId),
		plan: await planOf(db, organizationId),
	};
}

// Saves the customer's subscription as Stripe has it now. Locks the customer row, then fetches: the last sync to
// commit always saved the newest state, so a late or out-of-order webhook can't roll it back. Never trust a
// webhook's payload instead.
export async function syncSubscription(
	tx: Transaction,
	billing: BillingDriver,
	customerId: string,
): Promise<"synced" | "unknown_customer"> {
	const [customer] = await tx
		.select({ organizationId: billingCustomers.organizationId })
		.from(billingCustomers)
		.where(eq(billingCustomers.stripeCustomerId, customerId))
		.for("update");
	if (!customer) return "unknown_customer";
	const { organizationId } = customer;

	const subscription = await billing.currentSubscription(customerId);
	if (!subscription) {
		await tx
			.delete(billingSubscriptions)
			.where(eq(billingSubscriptions.organizationId, organizationId));
		return "synced";
	}
	const values = {
		stripeSubscriptionId: subscription.id,
		status: subscription.status,
		priceId: subscription.priceId,
		currentPeriodEnd: subscription.currentPeriodEnd,
		cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
		updatedAt: new Date(),
	};
	await tx
		.insert(billingSubscriptions)
		.values({ organizationId, ...values })
		.onConflictDoUpdate({
			target: billingSubscriptions.organizationId,
			set: values,
		});
	return "synced";
}
