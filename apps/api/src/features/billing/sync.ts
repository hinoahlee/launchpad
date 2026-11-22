import {
	billingCustomers,
	billingSubscriptions,
	type Transaction,
} from "@launchpad/db";
import { eq } from "drizzle-orm";
import type { BillingDriver } from "./driver.ts";

// Brings our copy of a customer's subscription up to date with Stripe. Run inside a transaction:
// 1. Lock the customer's row. A second sync for the same customer (two webhooks at once) waits here.
// 2. Ask Stripe for the subscription as it is now, while holding the lock.
// 3. Save it.
// Because each sync fetches after taking the lock, the last one to commit saved the newest state: an older answer
// can't land on top of a newer one. The cost: the lock (and a database connection) is held during one Stripe call.
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
	// Not one of ours: made in the Stripe dashboard, or its organization was deleted.
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
