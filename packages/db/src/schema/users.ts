import { boolean, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { citext, createdAt, updatedAt } from "./columns.ts";

// One row per person, however many ways they sign in (those are `accounts`). Better Auth's core schema: a
// plugin that adds fields adds them here too.
export const users = pgTable("users", {
	id: uuid("id").defaultRandom().primaryKey(),
	email: citext("email").notNull().unique(),
	name: text("name").notNull(),
	// Better Auth links a new sign-in method to an existing user only when this is true.
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	lastLoginMethod: text("last_login_method"),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
