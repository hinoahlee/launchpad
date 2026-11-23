import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, timestamptz, updatedAt } from "./columns.ts";
import { organizations } from "./organizations.ts";
import { users } from "./users.ts";

// Better Auth's core tables besides `users`. Its adapter maps its models to these exports by name (`usePlural`).

// One row per signed-in device. Deleting a row signs that device out.
export const sessions = pgTable(
	"sessions",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		token: text("token").notNull().unique(),
		expiresAt: timestamptz("expires_at").notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		activeOrganizationId: uuid("active_organization_id").references(
			() => organizations.id,
			{ onDelete: "set null" },
		),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [index("sessions_user_id_idx").on(t.userId)],
);

export type Session = typeof sessions.$inferSelect;

// One row per sign-in method of a user: `providerId` "google", "credential" (passwords, not enabled)...
export const accounts = pgTable(
	"accounts",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		providerId: text("provider_id").notNull(),
		accountId: text("account_id").notNull(),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamptz("access_token_expires_at"),
		refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
		scope: text("scope"),
		password: text("password"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [
		index("accounts_user_id_idx").on(t.userId),
		// Ours: one provider account belongs to one user, even if two sign-ins race.
		uniqueIndex("accounts_provider_account_idx").on(t.providerId, t.accountId),
	],
);

export type Account = typeof accounts.$inferSelect;

// Short-lived secrets (email codes, OAuth state), deleted once used or expired.
export const verifications = pgTable(
	"verifications",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamptz("expires_at").notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [index("verifications_identifier_idx").on(t.identifier)],
);
