import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	customType,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

// Case-insensitive text (Postgres `citext` extension, enabled in migration 0000): `Bob@X.com` and
// `bob@x.com` are equal, so the unique index rejects the second sign-up and lookups ignore case.
const citext = customType<{ data: string }>({ dataType: () => "citext" });

// with time zone: stored as an instant (UTC), never a local wall-clock time. Precision 3 (ms) matches a JS
// Date, so a value read and written back is unchanged (Postgres would otherwise keep microseconds).
const timestamptz = (name: string) =>
	timestamp(name, { withTimezone: true, precision: 3 });

// Auth tables (step 10.1): `users`, `sessions`, `accounts`, `verifications`. Better Auth reads and writes them
// through its Drizzle adapter, matching its models (user, session...) to these exports by name (`usePlural`) and
// its fields to the property names below. Their shape is Better Auth's core schema; it checks it at boot outside
// production, and apps/api/src/features/auth tests it. A plugin that adds fields adds them here too.

// One row per person, however many ways they sign in (those are `accounts`).
export const users = pgTable("users", {
	// Random (v4) UUID made by Postgres: ids can't be guessed or counted, unlike 1, 2, 3.
	id: uuid("id").defaultRandom().primaryKey(),
	email: citext("email").notNull().unique(),
	name: text("name").notNull(),
	// True once the person proved they own the address (an email code, or a provider that vouches for it).
	// Better Auth links a new sign-in method to an existing user by email only when it's verified.
	emailVerified: boolean("email_verified").default(false).notNull(),
	// Profile picture URL, from the provider (Google) or later an upload.
	image: text("image"),
	// How they last signed in: "google", "email-otp"... (Better Auth's lastLoginMethod plugin).
	lastLoginMethod: text("last_login_method"),
	createdAt: timestamptz("created_at").defaultNow().notNull(),
	// $onUpdate is applied by Drizzle on every UPDATE it builds; raw SQL updates must set it themselves.
	updatedAt: timestamptz("updated_at")
		.defaultNow()
		.notNull()
		.$onUpdate(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// One row per signed-in device or browser. The client holds `token` (the browser in a cookie); each request
// looks it up here, so deleting a row signs that device out at once.
export const sessions = pgTable(
	"sessions",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// Random, unguessable. Whoever has it is signed in as this user until expiresAt.
		token: text("token").notNull().unique(),
		// Pushed forward while the session is used (Better Auth: 7 days, renewed at most once a day).
		expiresAt: timestamptz("expires_at").notNull(),
		// Where it was created, to show "Chrome on macOS, 1.2.3.4" in the account page's session list (10.4).
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		createdAt: timestamptz("created_at").defaultNow().notNull(),
		updatedAt: timestamptz("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(t) => [index("sessions_user_id_idx").on(t.userId)],
);

export type Session = typeof sessions.$inferSelect;

// One row per way a user signs in: a Google account, later Apple or a password. `providerId` names the method
// ("google", "credential" for a password), `accountId` is the user's id at that provider.
export const accounts = pgTable(
	"accounts",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		providerId: text("provider_id").notNull(),
		accountId: text("account_id").notNull(),
		// The provider's tokens, for calling its API on the user's behalf (we don't yet). Secrets: never returned
		// by Better Auth's endpoints.
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamptz("access_token_expires_at"),
		refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
		scope: text("scope"),
		// Password hash, for the "credential" provider only. We don't enable passwords; kept because the schema
		// is Better Auth's.
		password: text("password"),
		createdAt: timestamptz("created_at").defaultNow().notNull(),
		updatedAt: timestamptz("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("accounts_user_id_idx").on(t.userId),
		// Ours, not Better Auth's: one provider account belongs to one user, even if two sign-ins race.
		uniqueIndex("accounts_provider_account_idx").on(t.providerId, t.accountId),
	],
);

export type Account = typeof accounts.$inferSelect;

// Short-lived secrets Better Auth checks later: an email code (10.3), OAuth state. Deleted once used or expired.
export const verifications = pgTable(
	"verifications",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		// What it's for, e.g. the email address a code was sent to.
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamptz("expires_at").notNull(),
		createdAt: timestamptz("created_at").defaultNow().notNull(),
		updatedAt: timestamptz("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(t) => [index("verifications_identifier_idx").on(t.identifier)],
);

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
		// Optional and unique: a second job with the same key is never inserted. Recurring jobs use it so each run
		// is queued once however many workers schedule it, e.g. "prune-jobs:2026-01-01T10:00:00.000Z". Postgres
		// allows any number of NULLs in a unique column, so jobs without a key are unaffected.
		key: text("key").unique(),
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

export const SUPPRESSION_REASONS = ["bounce", "complaint"] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

// Addresses we never email again: their mail server said the mailbox doesn't exist (a hard bounce), or the
// person marked one of our emails as spam (a complaint). Sending to them again hurts the domain's reputation,
// which pushes every email we send toward spam. Filled from the provider's webhook (step 9.3).
export const emailSuppressions = pgTable(
	"email_suppressions",
	{
		// citext: Bob@X.com and bob@x.com are the same mailbox.
		email: citext("email").primaryKey(),
		reason: text("reason").$type<SuppressionReason>().notNull(),
		createdAt: timestamptz("created_at").defaultNow().notNull(),
	},
	(t) => [
		// Keep in sync with SUPPRESSION_REASONS.
		check(
			"email_suppressions_reason_check",
			sql`${t.reason} in ('bounce', 'complaint')`,
		),
	],
);

export type EmailSuppression = typeof emailSuppressions.$inferSelect;
