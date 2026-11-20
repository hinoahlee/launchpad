CREATE TABLE "email_suppressions" (
	"email" "citext" PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_suppressions_reason_check" CHECK ("email_suppressions"."reason" in ('bounce', 'complaint'))
);
