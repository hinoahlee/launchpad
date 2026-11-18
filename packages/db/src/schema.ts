import {
	customType,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

// Case-insensitive text (Postgres `citext` extension, enabled in migration 0000): `Bob@X.com` and
// `bob@x.com` are equal, so the unique index rejects the second sign-up and lookups ignore case.
const citext = customType<{ data: string }>({ dataType: () => "citext" });

// with time zone: stored as an instant (UTC), never a local wall-clock time. Precision 3 (ms) matches a JS
// Date, so a value read and written back is unchanged (Postgres would otherwise keep microseconds).
const timestamptz = (name: string) =>
	timestamp(name, { withTimezone: true, precision: 3 });

export const users = pgTable("users", {
	// Random (v4) UUID made by Postgres: ids can't be guessed or counted, unlike 1, 2, 3.
	id: uuid("id").defaultRandom().primaryKey(),
	email: citext("email").notNull().unique(),
	name: text("name").notNull(),
	createdAt: timestamptz("created_at").defaultNow().notNull(),
	// $onUpdate is applied by Drizzle on every UPDATE it builds; raw SQL updates must set it themselves.
	updatedAt: timestamptz("updated_at")
		.defaultNow()
		.notNull()
		.$onUpdate(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
