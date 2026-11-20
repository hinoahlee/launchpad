import { z } from "zod";

// An optional URL where an empty value (`SENTRY_DSN=` in .env) means "not set".
const optionalUrl = z
	.url()
	.optional()
	.or(z.literal("").transform(() => undefined));

// An optional string where an empty value means "not set".
const optionalString = z
	.string()
	.min(1)
	.optional()
	.or(z.literal("").transform(() => undefined));

const postgresUrl = z
	.url({ protocol: /^postgres(ql)?$/ })
	.describe("postgres://user:password@host:port/database");

// Every environment variable the API reads, parsed once at boot. Nothing else reads process.env.
const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "test", "production"])
		.default("development"),
	PORT: z.coerce.number().int().min(1).max(65535).default(3000),
	LOG_LEVEL: z
		.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
		.default("info"),
	// The commit the image was built from. CI bakes it in (Dockerfile `ARG GIT_SHA`); `/api/version` reports
	// it so a deploy can check the new code is live. Unset in dev.
	GIT_SHA: z.string().default("dev"),
	// Postgres connection string: postgres://user:password@host:port/database. Required: every process
	// (server, worker, migrate) needs the database, so a missing value stops the boot.
	DATABASE_URL: postgresUrl,
	// A connection straight to Postgres, for when DATABASE_URL goes through a connection pooler in transaction
	// mode (Render's pooled URL, port 6432). That mode hands each transaction to any of its real connections, so
	// anything that lives on one connection breaks: the worker's LISTEN, and migrations. Unset: DATABASE_URL.
	DATABASE_DIRECT_URL: postgresUrl
		.optional()
		.or(z.literal("").transform(() => undefined)),
	// Where errors are reported (Sentry project launchpad-api → Client Keys). Unset: Sentry is off.
	SENTRY_DSN: optionalUrl,
	// The environment tag on every error (production, staging...). Unset: NODE_ENV.
	SENTRY_ENVIRONMENT: z.string().min(1).optional(),
	// Adds GET /api/debug/error, which throws, to check error reporting end to end. Turn on, test, turn off.
	DEBUG_ERROR_ROUTE: z.stringbool().default(false),
	// How many proxies sit in front of the app and append to X-Forwarded-For. The client IP (for rate limits)
	// is read that many hops from the right, so a client can't fake it by sending its own header. 0: no proxy
	// (dev). Render: 2 (Cloudflare, then Render's load balancer). Caddy on a VPS: 1.
	TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
	// Resend API key (Resend → API Keys; "Sending access", limited to the sending domain). Set with EMAIL_FROM.
	// Unset: the worker only logs emails. A secret. Only the worker reads it.
	RESEND_API_KEY: optionalString,
	// The sender: "Launchpad <hello@mail.example.com>" (or a bare address), on a domain verified in Resend.
	EMAIL_FROM: z
		.string()
		.regex(
			/^([^<>]+<[^<>\s]+@[^<>\s]+>|[^<>\s]+@[^<>\s]+)$/,
			"Name <address> or address",
		)
		.optional()
		.or(z.literal("").transform(() => undefined)),
	// Signing secret of the Resend webhook (Resend → Webhooks → the endpoint → Signing secret, "whsec_..."). Turns on
	// POST /api/webhooks/resend, which records bounced and complaining addresses. A secret. Only the server reads it.
	RESEND_WEBHOOK_SECRET: z
		.string()
		.regex(/^whsec_[A-Za-z0-9+/=]+$/, "whsec_ followed by base64")
		.optional()
		.or(z.literal("").transform(() => undefined)),
	// The public origin people open, e.g. https://render.noahlee.xyz (no path). Auth builds its links from it,
	// and accepts browser requests that change something (sign in, sign out) only from this origin. Required in
	// production for the server; in dev, Vite's origin (it proxies /api to us).
	APP_URL: z
		.url({ protocol: /^https?$/ })
		.refine((u) => new URL(u).pathname === "/", "an origin, without a path")
		.optional()
		.or(z.literal("").transform(() => undefined)),
	// Signs the session cookie and encrypts what Better Auth stores. 32+ random bytes, e.g. `openssl rand -base64
	// 32`. Changing it signs everyone out. A secret. Required in production for the server; dev and tests fall back
	// to a fixed value.
	BETTER_AUTH_SECRET: z
		.string()
		.min(32, "at least 32 characters: openssl rand -base64 32")
		.optional()
		.or(z.literal("").transform(() => undefined)),
});

export type Config = z.infer<typeof envSchema>;

// The URL for processes that need their own session: the worker (LISTEN) and migrate.
export const directDatabaseUrl = (config: Config) =>
	config.DATABASE_DIRECT_URL ?? config.DATABASE_URL;

// Fail fast: a bad value stops the process at boot with a readable message, not on the first request.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
	const result = envSchema
		// Half an email setup is a mistake: fail at boot rather than silently only logging emails.
		.refine((c) => !c.RESEND_API_KEY === !c.EMAIL_FROM, {
			message: "set RESEND_API_KEY and EMAIL_FROM together, or neither",
			path: ["EMAIL_FROM"],
		})
		.safeParse(env);
	if (!result.success) {
		console.error(
			`Invalid environment variables:\n${z.prettifyError(result.error)}`,
		);
		process.exit(1);
	}
	return result.data;
}
