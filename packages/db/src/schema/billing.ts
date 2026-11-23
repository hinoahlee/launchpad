import { boolean, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, timestamptz } from "./columns.ts";
import { organizations } from "./organizations.ts";

// The Stripe customer that pays for an organization. Syncs lock this row (apps/api/src/features/billing/service.ts).
export const billingCustomers = pgTable("billing_customers", {
	organizationId: uuid("organization_id")
		.primaryKey()
		.references(() => organizations.id, { onDelete: "cascade" }),
	stripeCustomerId: text("stripe_customer_id").notNull().unique(),
	createdAt: createdAt(),
});

export type BillingCustomer = typeof billingCustomers.$inferSelect;

// Our copy of the subscription, as Stripe reported it when we last asked (never from a webhook payload).
export const billingSubscriptions = pgTable("billing_subscriptions", {
	organizationId: uuid("organization_id")
		.primaryKey()
		.references(() => organizations.id, { onDelete: "cascade" }),
	stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
	// Text, not an enum: Stripe adds statuses, and an unknown one mustn't break a sync.
	status: text("status").notNull(),
	priceId: text("price_id").notNull(),
	currentPeriodEnd: timestamptz("current_period_end").notNull(),
	cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull(),
	updatedAt: timestamptz("updated_at").defaultNow().notNull(),
});

export type BillingSubscription = typeof billingSubscriptions.$inferSelect;

// Handled Stripe event ids, inserted in the same transaction as the event's sync: duplicates become no-ops.
export const stripeEvents = pgTable("stripe_events", {
	id: text("id").primaryKey(),
	type: text("type").notNull(),
	processedAt: timestamptz("processed_at").defaultNow().notNull(),
});
