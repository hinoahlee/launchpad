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
	// The public origin people open, e.g. https://launchpad.noahlee.xyz (no path). Auth builds its links from it,
	// and accepts browser requests that change something (sign in, sign out) only from this origin. Required in
	// production for the server; in dev, Vite's origin (it proxies /api to us).
	APP_URL: z
		.url({ protocol: /^https?$/ })
		// canParse first: Zod runs this even when the URL check above failed, and `new URL("")` would throw.
		.refine(
			(u) => URL.canParse(u) && new URL(u).pathname === "/",
			"an origin, without a path",
		)
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
	// Google sign-in (Google Cloud → Google Auth Platform → Clients → the web client). Set both, or neither: unset,
	// Google sign-in is off. The secret is a secret. Only the server reads them.
	GOOGLE_CLIENT_ID: optionalString,
	GOOGLE_CLIENT_SECRET: optionalString,
	// File storage: any S3-compatible bucket (runbook: docs/runbooks/r2-bucket.md). Set the bucket and both keys
	// together, or none: unset, file uploads are off. The server signs URLs; the worker deletes files (cleanup jobs).
	// The S3 API's address. R2: https://<ACCOUNT_ID>.r2.cloudflarestorage.com. Unset: AWS S3 (the SDK picks it).
	S3_ENDPOINT: optionalUrl,
	// R2: "auto". AWS S3: the bucket's region (us-east-1...).
	S3_REGION: z.string().min(1).default("auto"),
	S3_BUCKET: optionalString,
	// An access key that can only read and write objects in S3_BUCKET (R2: an "Object Read & Write" token
	// limited to that bucket). The secret is a secret.
	S3_ACCESS_KEY_ID: optionalString,
	S3_SECRET_ACCESS_KEY: optionalString,
	// Billing (Stripe). Set both, or neither: unset, the billing routes are off. Only the server reads them.
	// A restricted key ("rk_..."; Stripe → Developers → API keys) allowed only what the API calls: Customers,
	// Checkout Sessions and Customer portal (write), Subscriptions and Prices (read). A secret.
	STRIPE_API_KEY: z
		.string()
		.regex(/^(rk|sk)_(test|live)_\w+$/, "rk_test_..., rk_live_... (or sk_...)")
		.optional()
		.or(z.literal("").transform(() => undefined)),
	// The monthly price Checkout sells (Stripe → Product catalog → the product → the price: "price_..."). Not a secret.
	STRIPE_PRICE_ID: z
		.string()
		.regex(/^price_\w+$/, "price_...")
		.optional()
		.or(z.literal("").transform(() => undefined)),
	// Signing secret of the Stripe webhook endpoint ("whsec_..."): turns on POST /api/webhooks/stripe, which keeps
	// subscriptions in sync. Deployed: Stripe → Developers → Webhooks → the endpoint → Signing secret. Local: printed by
	// `stripe listen`. Needs STRIPE_API_KEY (each event is re-fetched from Stripe). A secret. Only the server reads it.
	STRIPE_WEBHOOK_SECRET: z
		.string()
		.regex(/^whsec_\w+$/, "whsec_...")
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
		// Same for Google: half a client is a typo, not a choice.
		.refine((c) => !c.GOOGLE_CLIENT_ID === !c.GOOGLE_CLIENT_SECRET, {
			message:
				"set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET together, or neither",
			path: ["GOOGLE_CLIENT_SECRET"],
		})
		// Storage: a bucket without keys (or keys without a bucket) is half a setup, so fail at boot.
		.refine(
			(c) => {
				const set = [c.S3_BUCKET, c.S3_ACCESS_KEY_ID, c.S3_SECRET_ACCESS_KEY];
				return set.every((v) => !v) || set.every(Boolean);
			},
			{
				message:
					"set S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY together, or none",
				path: ["S3_BUCKET"],
			},
		)
		// No endpoint means AWS S3, which has no "auto" region: requests would fail at upload time, not here.
		.refine((c) => !c.S3_BUCKET || c.S3_ENDPOINT || c.S3_REGION !== "auto", {
			message: "AWS S3 (no S3_ENDPOINT) needs S3_REGION, e.g. us-east-1",
			path: ["S3_REGION"],
		})
		// Billing: a key without a price (or the reverse) can't sell anything.
		.refine((c) => !c.STRIPE_API_KEY === !c.STRIPE_PRICE_ID, {
			message: "set STRIPE_API_KEY and STRIPE_PRICE_ID together, or neither",
			path: ["STRIPE_PRICE_ID"],
		})
		.refine((c) => !c.STRIPE_WEBHOOK_SECRET || c.STRIPE_API_KEY, {
			message: "STRIPE_WEBHOOK_SECRET needs STRIPE_API_KEY and STRIPE_PRICE_ID",
			path: ["STRIPE_WEBHOOK_SECRET"],
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
