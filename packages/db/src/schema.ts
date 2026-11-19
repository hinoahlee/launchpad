import { sql } from "drizzle-orm";
import {
	check,
	customType,
	index,
	integer,
	jsonb,
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

export const JOB_STATUSES = ["queued", "running", "done", "failed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

// The job queue: one row per piece of background work. The API (or any code) inserts rows with `enqueue()`
// in apps/api/src/lib/jobs; the worker process claims and runs them (step 8.2). Rows are kept after they finish,
// so `done` and `failed` jobs can be inspected.
export const jobs = pgTable(
	"jobs",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		// Which handler runs it, e.g. "echo". Each type's payload shape is a Zod schema in the API.
		type: text("type").notNull(),
		// The job's input, already checked against its type's schema when it was queued.
		payload: jsonb("payload").notNull(),
		status: text("status").$type<JobStatus>().notNull().default("queued"),
		// Bumped each time a worker claims the job (8.2). Also the fencing token: a worker may finish or fail
		// a job only while `attempts` still equals the value it claimed it with.
		attempts: integer("attempts").notNull().default(0),
		// Not before this time: set in the future to delay a job, or to back off before a retry (8.2).
		runAfter: timestamptz("run_after").defaultNow().notNull(),
		// While running: when the worker's claim runs out. Past it, the job counts as abandoned (worker crashed)
		// and another worker may take it (8.2).
		leaseExpiresAt: timestamptz("lease_expires_at"),
		lastError: text("last_error"),
		createdAt: timestamptz("created_at").defaultNow().notNull(),
		updatedAt: timestamptz("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		// The database rejects a typo'd status even from raw SQL. Keep in sync with JOB_STATUSES.
		check(
			"jobs_status_check",
			sql`${t.status} in ('queued', 'running', 'done', 'failed')`,
		),
		check("jobs_attempts_check", sql`${t.attempts} >= 0`),
		// The worker's question, "which job is next?": queued jobs whose run_after has passed, oldest first.
		index("jobs_claim_idx").on(t.status, t.runAfter),
	],
);

export type Job = typeof jobs.$inferSelect;
