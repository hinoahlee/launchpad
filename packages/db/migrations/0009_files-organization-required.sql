-- Hand-written, before the generated ALTER (expand/contract, decision 005). Since 12.2 is deployed, every release
-- running sets files.organization_id; only rows the release before it inserted during that deploy may be NULL.
-- 1. A user who signed up through the pre-12.1 release while 12.1 deployed has no organization yet: give them
--    theirs (the same as 0007's backfill), so step 2 can place their files.
WITH personal AS (
	INSERT INTO "organizations" ("name", "slug")
	SELECT 'Personal', 'personal-' || "users"."id" FROM "users"
	WHERE NOT EXISTS (SELECT 1 FROM "members" WHERE "members"."user_id" = "users"."id")
	RETURNING "id", "slug"
)
INSERT INTO "members" ("organization_id", "user_id", "role")
SELECT "id", substring("slug" FROM 10)::uuid, 'owner' FROM personal;--> statement-breakpoint
-- 2. Each file still without one belongs to its uploader's organization (one per user, decision 010).
UPDATE "files" SET "organization_id" = "members"."organization_id"
FROM "members" WHERE "members"."user_id" = "files"."user_id" AND "files"."organization_id" IS NULL;--> statement-breakpoint
ALTER TABLE "files" ALTER COLUMN "organization_id" SET NOT NULL;
