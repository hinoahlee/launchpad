ALTER TABLE "files" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_organization_id_idx" ON "files" USING btree ("organization_id");--> statement-breakpoint
-- Hand-written backfill: each file belongs to its uploader's organization (one per user, decision 010). Rows the
-- previous release inserts while this deploy runs stay NULL; step 12.3 backfills them again before NOT NULL.
UPDATE "files" SET "organization_id" = "members"."organization_id"
FROM "members" WHERE "members"."user_id" = "files"."user_id" AND "files"."organization_id" IS NULL;
