import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	uuid,
} from "drizzle-orm/pg-core";
import { createdAt, timestamptz, updatedAt } from "./columns.ts";
import type { JobStatus } from "./constants.ts";

// The job queue (apps/api/src/lib/jobs). Finished rows are kept for inspection; prune-jobs deletes old `done` ones.
export const jobs = pgTable(
	"jobs",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		type: text("type").notNull(),
		payload: jsonb("payload").notNull(),
		status: text("status").$type<JobStatus>().notNull().default("queued"),
		// Incremented on each claim; also the fencing token (queue.ts).
		attempts: integer("attempts").notNull().default(0),
		runAfter: timestamptz("run_after").defaultNow().notNull(),
		leaseExpiresAt: timestamptz("lease_expires_at"),
		lastError: text("last_error"),
		// Unique when set: one row per scheduled run, however many workers queue it.
		key: text("key").unique(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [
		check(
			"jobs_status_check",
			sql`${t.status} in ('queued', 'running', 'done', 'failed')`,
		),
		check("jobs_attempts_check", sql`${t.attempts} >= 0`),
		index("jobs_claim_idx").on(t.status, t.runAfter),
	],
);

export type Job = typeof jobs.$inferSelect;
