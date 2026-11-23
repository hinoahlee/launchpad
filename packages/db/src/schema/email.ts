import { sql } from "drizzle-orm";
import { check, pgTable, text } from "drizzle-orm/pg-core";
import { citext, createdAt } from "./columns.ts";
import type { SuppressionReason } from "./constants.ts";

// Addresses never emailed again (hard bounce or spam complaint), from the email provider's webhook.
export const emailSuppressions = pgTable(
	"email_suppressions",
	{
		email: citext("email").primaryKey(),
		reason: text("reason").$type<SuppressionReason>().notNull(),
		createdAt: createdAt(),
	},
	(t) => [
		check(
			"email_suppressions_reason_check",
			sql`${t.reason} in ('bounce', 'complaint')`,
		),
	],
);

export type EmailSuppression = typeof emailSuppressions.$inferSelect;
