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
		// The organization this device is working in (organization plugin, 12.1). Set when the session starts, changed
		// by POST /api/auth/organization/set-active. Cleared if that organization is deleted.
		activeOrganizationId: uuid("active_organization_id").references(
			() => organizations.id,
			{ onDelete: "set null" },
		),
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

// Organizations (phase 12): Better Auth's organization plugin reads and writes these three tables, like the auth
// tables above. An organization is a tenant: the group that owns data. People belong to it through `members`.
// Default (decision 010): one person, one organization. Each user has exactly one, made for them, which they own
// alone. The two unique indexes on `members` make anything else impossible; teams are a later feature.

export const organizations = pgTable("organizations", {
	id: uuid("id").defaultRandom().primaryKey(),
	name: text("name").notNull(),
	// Unique, URL-safe handle. Better Auth requires one; ours are random (personal-organization.ts).
	slug: text("slug").notNull().unique(),
	logo: text("logo"),
	// Better Auth stores its JSON as a string.
	metadata: text("metadata"),
	createdAt: timestamptz("created_at").defaultNow().notNull(),
});

export type Organization = typeof organizations.$inferSelect;

export const ROLES = ["owner", "admin", "member"] as const;
export type Role = (typeof ROLES)[number];

// Who belongs to which organization, with their role there. Today exactly one row per user and per organization.
export const members = pgTable(
	"members",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// Better Auth allows several roles as "admin,member"; we use exactly one. Keep in sync with ROLES.
		role: text("role").$type<Role>().notNull().default("member"),
		createdAt: timestamptz("created_at").defaultNow().notNull(),
	},
	(t) => [
		// Ours, not Better Auth's (decision 010): a user belongs to one organization, and an organization has one
		// member. Postgres refuses a second row whatever the code does: a race, a script, a forgotten check. Teams
		// replace these two with one unique index on (organization_id, user_id).
		uniqueIndex("members_user_id_idx").on(t.userId),
		uniqueIndex("members_organization_id_idx").on(t.organizationId),
		check("members_role_check", sql`${t.role} in ('owner', 'admin', 'member')`),
	],
);

export type Member = typeof members.$inferSelect;

export const INVITATION_STATUSES = [
	"pending",
	"accepted",
	"rejected",
	"canceled",
] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

// An invitation to join an organization, by email. Unused (invites are off, decision 010): Better Auth's schema
// check requires the table, and teams will need it.
export const invitations = pgTable(
	"invitations",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		email: citext("email").notNull(),
		role: text("role").$type<Role>(),
		status: text("status")
			.$type<InvitationStatus>()
			.notNull()
			.default("pending"),
		expiresAt: timestamptz("expires_at").notNull(),
		inviterId: uuid("inviter_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		createdAt: timestamptz("created_at").defaultNow().notNull(),
	},
	(t) => [
		index("invitations_organization_id_idx").on(t.organizationId),
		index("invitations_email_idx").on(t.email),
		check(
			"invitations_role_check",
			sql`${t.role} in ('owner', 'admin', 'member')`,
		),
		check(
			"invitations_status_check",
			sql`${t.status} in ('pending', 'accepted', 'rejected', 'canceled')`,
		),
	],
);

export type Invitation = typeof invitations.$inferSelect;

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

// Files people upload (phase 11). The bytes live in the bucket under `storageKey`; this row says who owns them
// and what they are. A row starts pending (`uploadedAt` null) when the browser asks to upload, and counts as
// uploaded once the API has checked the object in the bucket has the size registered here.
export const files = pgTable(
	"files",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		// Cascade: deleting a user deletes their rows. The objects in the bucket go separately (step 11.4).
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// The name the person gave it, shown in lists and used when they download it. Never part of the key.
		fileName: text("file_name").notNull(),
		contentType: text("content_type").notNull(),
		sizeBytes: integer("size_bytes").notNull(),
		// Where the object is in the bucket: users/<userId>/<random uuid>. Unique per upload.
		storageKey: text("storage_key").notNull().unique(),
		uploadedAt: timestamptz("uploaded_at"),
		createdAt: timestamptz("created_at").defaultNow().notNull(),
	},
	(t) => [index("files_user_id_idx").on(t.userId)],
);

export type FileRow = typeof files.$inferSelect;
