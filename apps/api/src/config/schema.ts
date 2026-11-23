import { z } from "zod";

// Every environment variable the API reads. Each is documented in apps/api/.env.example and
// docs/deploy-contract.md.

// An empty value (`SENTRY_DSN=` in .env) means "not set".
const unset = z.literal("").transform(() => undefined);
const optional = <T extends z.ZodType>(schema: T) =>
	schema.optional().or(unset);

const optionalString = optional(z.string().min(1));

const postgresUrl = z
	.url({ protocol: /^postgres(ql)?$/ })
	.describe("postgres://user:password@host:port/database");

export const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "test", "production"])
		.default("development"),
	PORT: z.coerce.number().int().min(1).max(65535).default(3000),
	LOG_LEVEL: z
		.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
		.default("info"),
	GIT_SHA: z.string().default("dev"),
	DATABASE_URL: postgresUrl,
	DATABASE_DIRECT_URL: optional(postgresUrl),
	SENTRY_DSN: optional(z.url()),
	SENTRY_ENVIRONMENT: z.string().min(1).optional(),
	DEBUG_ERROR_ROUTE: z.stringbool().default(false),
	TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
	RESEND_API_KEY: optionalString,
	EMAIL_FROM: optional(
		z
			.string()
			.regex(
				/^([^<>]+<[^<>\s]+@[^<>\s]+>|[^<>\s]+@[^<>\s]+)$/,
				"Name <address> or address",
			),
	),
	RESEND_WEBHOOK_SECRET: optional(
		z.string().regex(/^whsec_[A-Za-z0-9+/=]+$/, "whsec_ followed by base64"),
	),
	APP_URL: optional(
		z
			.url({ protocol: /^https?$/ })
			// canParse first: Zod runs this even when the URL check failed, and `new URL("")` throws.
			.refine(
				(u) => URL.canParse(u) && new URL(u).pathname === "/",
				"an origin, without a path",
			),
	),
	BETTER_AUTH_SECRET: optional(
		z.string().min(32, "at least 32 characters: openssl rand -base64 32"),
	),
	GOOGLE_CLIENT_ID: optionalString,
	GOOGLE_CLIENT_SECRET: optionalString,
	S3_ENDPOINT: optional(z.url()),
	S3_REGION: z.string().min(1).default("auto"),
	S3_BUCKET: optionalString,
	S3_ACCESS_KEY_ID: optionalString,
	S3_SECRET_ACCESS_KEY: optionalString,
	STRIPE_API_KEY: optional(
		z
			.string()
			.regex(
				/^(rk|sk)_(test|live)_\w+$/,
				"rk_test_..., rk_live_... (or sk_...)",
			),
	),
	STRIPE_PRICE_ID: optional(z.string().regex(/^price_\w+$/, "price_...")),
	STRIPE_WEBHOOK_SECRET: optional(z.string().regex(/^whsec_\w+$/, "whsec_...")),
});

export type Config = z.infer<typeof envSchema>;
