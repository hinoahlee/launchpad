import { index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, timestamptz } from "./columns.ts";
import { organizations } from "./organizations.ts";
import { users } from "./users.ts";

// Bytes live in the bucket under `storageKey`. Pending (`uploadedAt` null) until the API has checked the object.
export const files = pgTable(
	"files",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		// The uploader. Teams will want SET NULL, so a member leaving doesn't take the team's files.
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		fileName: text("file_name").notNull(),
		contentType: text("content_type").notNull(),
		sizeBytes: integer("size_bytes").notNull(),
		storageKey: text("storage_key").notNull().unique(),
		uploadedAt: timestamptz("uploaded_at"),
		createdAt: createdAt(),
	},
	(t) => [
		index("files_organization_id_idx").on(t.organizationId),
		index("files_user_id_idx").on(t.userId),
	],
);

export type FileRow = typeof files.$inferSelect;
