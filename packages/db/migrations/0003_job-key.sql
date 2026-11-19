ALTER TABLE "jobs" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_key_unique" UNIQUE("key");