import { sql } from "drizzle-orm";
import {
	check,
	index,
	pgTable,
	text,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { citext, createdAt, timestamptz } from "./columns.ts";
import type { InvitationStatus, Role } from "./constants.ts";
import { users } from "./users.ts";

// Better Auth's organization plugin. An organization is the tenant that owns data; today each user owns exactly
// one, alone (enforced by the unique indexes on `members`).

export const organizations = pgTable("organizations", {
	id: uuid("id").defaultRandom().primaryKey(),
	name: text("name").notNull(),
	slug: text("slug").notNull().unique(),
	logo: text("logo"),
	metadata: text("metadata"),
	createdAt: createdAt(),
});

export type Organization = typeof organizations.$inferSelect;

export const members = pgTable(
	"members",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		role: text("role").$type<Role>().notNull().default("member"),
		createdAt: createdAt(),
	},
	(t) => [
		// One person, one organization. Teams replace these two with one unique index on (organization_id, user_id).
		uniqueIndex("members_user_id_idx").on(t.userId),
		uniqueIndex("members_organization_id_idx").on(t.organizationId),
		check("members_role_check", sql`${t.role} in ('owner', 'admin', 'member')`),
	],
);

export type Member = typeof members.$inferSelect;

// Unused (invitations are off), but Better Auth's schema check requires it, and teams will need it.
export const invitations = pgTable(
	"invitations",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		email: citext("email").notNull(),
		role: text("role").$type<Role>(),
		status: text("status")
			.$type<InvitationStatus>()
			.notNull()
			.default("pending"),
		expiresAt: timestamptz("expires_at").notNull(),
		inviterId: uuid("inviter_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		createdAt: createdAt(),
	},
	(t) => [
		index("invitations_organization_id_idx").on(t.organizationId),
		index("invitations_email_idx").on(t.email),
		check(
			"invitations_role_check",
			sql`${t.role} in ('owner', 'admin', 'member')`,
		),
		check(
			"invitations_status_check",
			sql`${t.status} in ('pending', 'accepted', 'rejected', 'canceled')`,
		),
	],
);

export type Invitation = typeof invitations.$inferSelect;
