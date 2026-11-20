import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { Database } from "@launchpad/db";
import { betterAuth } from "better-auth";
import { emailOTP, lastLoginMethod } from "better-auth/plugins";
import type { FastifyBaseLogger } from "fastify";
import type { Config } from "#config.ts";
import { enqueue } from "#lib/jobs/enqueue.ts";

// The header our Fastify route fills with the client's IP (`request.ip`, which honours TRUST_PROXY_HOPS) before
// handing the request to Better Auth. Its rate limits key on it. Left to read X-Forwarded-For itself, Better Auth
// would trust it only with a single entry, and Render's chain has three.
export const CLIENT_IP_HEADER = "x-launchpad-client-ip";

// Dev and tests only: a public value, so sessions signed with it prove nothing. Production refuses to start
// without its own secret (below).
const DEV_SECRET = "dev-only-secret-never-used-in-production";
// How long an emailed sign-in code works.
export const SIGN_IN_CODE_MINUTES = 5;
// Wrong guesses one code survives; the next guess is refused even if right, and a new code must be sent.
export const SIGN_IN_CODE_ATTEMPTS = 3;
// The public origin. Unset in dev: Vite's dev server, which proxies /api to us, so it's the origin the browser sees.
export const appUrl = (config: Config) =>
	config.APP_URL ?? "http://localhost:5173";

export function createAuth(
	config: Config,
	db: Database,
	log: FastifyBaseLogger,
) {
	if (
		config.NODE_ENV === "production" &&
		(!config.APP_URL || !config.BETTER_AUTH_SECRET)
	) {
		throw new Error(
			"APP_URL and BETTER_AUTH_SECRET are required in production",
		);
	}
	const origin = appUrl(config);

	return betterAuth({
		appName: "Launchpad",
		// Links Better Auth makes (OAuth redirect URIs, 10.2) start here. Set, so it never guesses from the
		// request's Host header, which a client controls.
		baseURL: origin,
		basePath: "/api/auth",
		secret: config.BETTER_AUTH_SECRET ?? DEV_SECRET,
		// CSRF defence: a request that changes something must come from one of these origins (its `Origin`
		// header), or Better Auth rejects it. baseURL's origin is always trusted; listed for clarity.
		trustedOrigins: [origin],
		// Its four tables (users, sessions, accounts, verifications) are in @launchpad/db's schema and migrate
		// with ours; `usePlural` maps its model "user" to our export `users`.
		database: drizzleAdapter(db, { provider: "pg", usePlural: true }),
		// Sign-in methods. Google only when its client is configured (config.ts requires both values or neither).
		// Google sends people back to <APP_URL>/api/auth/callback/google: that exact URL must be listed in the
		// Google client's "Authorized redirect URIs".
		socialProviders: {
			...(config.GOOGLE_CLIENT_ID &&
				config.GOOGLE_CLIENT_SECRET && {
					google: {
						clientId: config.GOOGLE_CLIENT_ID,
						clientSecret: config.GOOGLE_CLIENT_SECRET,
						// Always show Google's account picker, so someone signed in to several Google accounts picks one.
						prompt: "select_account" as const,
					},
				}),
		},
		// Per client IP (CLIENT_IP_HEADER), in memory, so per instance: 100 requests per 10 s on /api/auth/*, and
		// stricter rules from plugins (email codes: 3 a minute per endpoint). Better Auth turns it on when it reads
		// NODE_ENV=production itself; set from our config instead, so a test can build a production app to check it.
		rateLimit: { enabled: config.NODE_ENV === "production" },
		// When a sign-in fails at the callback (cancelled at Google, expired, a link refused), Better Auth redirects
		// here with `?error=<code>`. Our sign-in page explains it. Its own fallback is an HTML page whose inline
		// styles our CSP blocks.
		onAPIError: { errorURL: `${origin}/sign-in` },
		plugins: [
			// Passwordless sign-in with a one-time code by email. POST /api/auth/email-otp/send-verification-otp
			// stores the code and queues the email; POST /api/auth/sign-in/email-otp checks it and starts a session.
			// An address with no account gets one (owning the inbox is the proof), with emailVerified true, so
			// a later Google sign-in with the same address joins the same user.
			emailOTP({
				otpLength: 6,
				expiresIn: SIGN_IN_CODE_MINUTES * 60,
				// Brute-force protection: a code dies after this many wrong guesses (403 TOO_MANY_ATTEMPTS), so each
				// code gives a guesser 3 chances in a million. Better Auth's per-IP limit (3 sends and 3 sign-in tries
				// a minute, production only) then makes new codes slow to get.
				allowedAttempts: SIGN_IN_CODE_ATTEMPTS,
				// Only a SHA-256 hash of the code is in `verifications`: a database leak shows no usable code.
				storeOTP: "hashed",
				// Better Auth calls this inside the request. Queuing (one insert) takes the same time whether the
				// address has an account or not, so the response doesn't tell which; the worker sends it.
				sendVerificationOTP: async ({ email, otp, type }) => {
					// The plugin can also mint codes for email verification and password resets, which this app
					// doesn't use: those requests store a code and send nothing.
					if (type !== "sign-in") {
						log.warn({ type }, "auth: email code requested for an unused flow");
						return;
					}
					await enqueue(db, "send_email", {
						template: "sign-in-code",
						to: email,
						props: { code: otp, expiresInMinutes: SIGN_IN_CODE_MINUTES },
					});
				},
			}),
			// Records how each user last signed in ("google", "email-otp"...) in users.last_login_method. Its
			// cookie copy is off: nothing in the browser needs it.
			lastLoginMethod({
				storeInDatabase: true,
				beforeStoreCookie: () => false,
			}),
		],
		advanced: {
			// Ids are uuid columns that Postgres fills in (gen_random_uuid()), like every other table.
			database: { generateId: "uuid" },
			ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
			// On everywhere. Better Auth skips its origin (CSRF) check when NODE_ENV=test, so tests would pass
			// without proving it works.
			disableOriginCheck: false,
		},
		// Its log lines go through our logger: JSON on stdout, like every other line (deploy contract, row 8).
		logger: {
			log: (level, message, ...args) =>
				log[level]({ args }, `auth: ${message}`),
		},
	});
}

export type Auth = ReturnType<typeof createAuth>;
