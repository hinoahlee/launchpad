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
	db: Database | Transaction,
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
//
// The lock is held while Stripe answers, so each waiting sync also holds a database connection. Where the caller
// is a member who can send many at once, pass `wait: false`: if another sync holds the lock it returns "busy" at
// once, and that sync saves a state at least as new.
export async function syncSubscription(
	tx: Transaction,
	billing: BillingDriver,
	customerId: string,
	{ wait = true }: { wait?: boolean } = {},
): Promise<"synced" | "unknown_customer" | "busy"> {
	const byId = eq(billingCustomers.stripeCustomerId, customerId);
	const locked = tx
		.select({ organizationId: billingCustomers.organizationId })
		.from(billingCustomers)
		.where(byId);
	const [customer] = await (wait
		? locked.for("update")
		: locked.for("update", { skipLocked: true }));
	if (!customer) {
		if (wait) return "unknown_customer";
		const [exists] = await tx
			.select({ id: billingCustomers.stripeCustomerId })
			.from(billingCustomers)
			.where(byId);
		return exists ? "busy" : "unknown_customer";
	}
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

// Account deletion, before the organization's rows go: deleting the Stripe customer stops every charge. A Stripe
// failure throws, which stops the deletion, so the person retries rather than being billed for a deleted account.
export async function closeBillingAccount(
	db: Database,
	billing: BillingDriver,
	organizationId: string,
): Promise<void> {
	const customerId = await customerIdOf(db, organizationId);
	if (!customerId) return;
	await billing.deleteCustomer(customerId);
	// Now, not with the organization: if its deletion fails, no row points at a customer Stripe no longer has.
	await db.transaction(async (tx) => {
		await tx
			.delete(billingSubscriptions)
			.where(eq(billingSubscriptions.organizationId, organizationId));
		await tx
			.delete(billingCustomers)
			.where(eq(billingCustomers.organizationId, organizationId));
	});
}
