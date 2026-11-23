import { customType, timestamp } from "drizzle-orm/pg-core";

// Case-insensitive text (the citext extension, migration 0000): unique indexes and lookups ignore case.
export const citext = customType<{ data: string }>({
	dataType: () => "citext",
});

// An instant (UTC) at millisecond precision, matching a JS Date: a value read and written back is unchanged.
export const timestamptz = (name: string) =>
	timestamp(name, { withTimezone: true, precision: 3 });

export const createdAt = () => timestamptz("created_at").defaultNow().notNull();

// $onUpdate applies to updates Drizzle builds; raw SQL updates must set it themselves.
export const updatedAt = () =>
	timestamptz("updated_at")
		.defaultNow()
		.notNull()
		.$onUpdate(() => new Date());
