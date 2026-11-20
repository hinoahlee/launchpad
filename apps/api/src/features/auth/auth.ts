import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { Database } from "@launchpad/db";
import { betterAuth } from "better-auth";
import { lastLoginMethod } from "better-auth/plugins";
import type { FastifyBaseLogger } from "fastify";
import type { Config } from "#config.ts";

// The header our Fastify route fills with the client's IP (`request.ip`, which honours TRUST_PROXY_HOPS) before
// handing the request to Better Auth. Its rate limits key on it. Left to read X-Forwarded-For itself, Better Auth
// would trust it only with a single entry, and Render's chain has three.
export const CLIENT_IP_HEADER = "x-launchpad-client-ip";

// Dev and tests only: a public value, so sessions signed with it prove nothing. Production refuses to start
// without its own secret (below).
const DEV_SECRET = "dev-only-secret-never-used-in-production";
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
		// Records how each user last signed in ("google", "email-otp"...) in users.last_login_method. Its
		// cookie copy is off: nothing in the browser needs it.
		plugins: [
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
