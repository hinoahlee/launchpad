import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { Database } from "@launchpad/db";
import { PRODUCT_NAME, SIGN_IN_CODE_MINUTES } from "@launchpad/shared";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import {
	bearer,
	emailOTP,
	lastLoginMethod,
	organization,
} from "better-auth/plugins";
import type { FastifyBaseLogger } from "fastify";
import type { Config } from "#config/schema.ts";
import { appUrl } from "#config/utils.ts";
import { enqueue } from "#lib/jobs/enqueue.ts";
import { AFTER_UPLOAD_URLS_EXPIRE_MS } from "#lib/storage/driver/constants.ts";
import {
	CLIENT_IP_HEADER,
	DEV_SECRET,
	RECENT_SIGN_IN_MINUTES,
	SIGN_IN_CODE_ATTEMPTS,
} from "./constants.ts";
import {
	deleteUserOrganization,
	initialOrganizationId,
} from "./personal-organization.ts";
import { signInCodeLimit } from "./sign-in-code-limit.ts";

// Better Auth, mounted at /api/auth/* (routes.ts). Its tables live in @launchpad/db's schema.
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
		appName: PRODUCT_NAME,
		// Set, so it never builds links from the client-controlled Host header.
		baseURL: origin,
		basePath: "/api/auth",
		secret: config.BETTER_AUTH_SECRET ?? DEV_SECRET,
		trustedOrigins: [origin],
		database: drizzleAdapter(db, { provider: "pg", usePlural: true }),
		socialProviders: {
			...(config.GOOGLE_CLIENT_ID &&
				config.GOOGLE_CLIENT_SECRET && {
					google: {
						clientId: config.GOOGLE_CLIENT_ID,
						clientSecret: config.GOOGLE_CLIENT_SECRET,
						prompt: "select_account" as const,
					},
				}),
		},
		// Better Auth would enable this from NODE_ENV itself; from our config, tests can build a production app.
		rateLimit: { enabled: config.NODE_ENV === "production" },
		hooks: { before: signInCodeLimit(db) },
		// Failed callbacks land on /sign-in?error=<code>. Better Auth's own error page uses inline styles the CSP blocks.
		onAPIError: { errorURL: `${origin}/sign-in` },
		session: { freshAge: RECENT_SIGN_IN_MINUTES * 60 },
		user: {
			// A hard delete. Every table pointing at users must use ON DELETE CASCADE; cleanup outside Postgres
			// (bucket, billing provider) goes here.
			deleteUser: {
				enabled: true,
				// Before, not after: afterwards nothing says which organization was theirs.
				beforeDelete: async (user) => {
					await deleteUserOrganization(
						db,
						user.id,
						async (tx, organizationId) => {
							if (config.S3_BUCKET) {
								await enqueue(
									tx,
									"delete-organization-files",
									{ organizationId },
									{
										runAfter: new Date(
											Date.now() + AFTER_UPLOAD_URLS_EXPIRE_MS,
										),
									},
								);
							}
						},
					);
				},
				afterDelete: async (user) => {
					// The id only: the email is personal data.
					log.info({ userId: user.id }, "auth: account deleted");
				},
			},
		},
		plugins: [
			// Passwordless sign-in by emailed code; a first sign-in creates the user.
			emailOTP({
				otpLength: 6,
				expiresIn: SIGN_IN_CODE_MINUTES * 60,
				allowedAttempts: SIGN_IN_CODE_ATTEMPTS,
				storeOTP: "hashed",
				// Queuing takes the same time whether the address has an account or not, so the response leaks nothing.
				sendVerificationOTP: async ({ email, otp, type }) => {
					// Email verification and password reset aren't used.
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
			lastLoginMethod({
				storeInDatabase: true,
				beforeStoreCookie: () => false,
			}),
			// Non-browser clients: `Authorization: Bearer <set-auth-token>` works wherever the cookie does
			// (docs/api-clients.md). Only the signed token: `sessions.token` stores the bare one, so a database leak
			// hands out nothing usable.
			bearer({ requireSignature: true }),
			// One person, one organization: users can't create, delete, rename or invite. Teams start by lifting
			// these limits and replacing the two unique indexes on `members`.
			organization({
				allowUserToCreateOrganization: false,
				disableOrganizationDeletion: true,
				invitationLimit: 0,
				membershipLimit: 1,
				organizationHooks: {
					beforeUpdateOrganization: async () => {
						throw new APIError("FORBIDDEN", {
							code: "ORGANIZATION_UPDATE_DISABLED",
							message: "Organizations can't be changed.",
						});
					},
				},
			}),
		],
		databaseHooks: {
			session: {
				create: {
					// Every session starts in the user's organization, created on their first sign-in.
					before: async (session) => ({
						data: {
							...session,
							activeOrganizationId: await initialOrganizationId(
								db,
								session.userId,
							),
						},
					}),
				},
			},
		},
		advanced: {
			database: { generateId: "uuid" },
			ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
			// Better Auth skips its CSRF check when NODE_ENV=test; forced on so tests prove it.
			disableOriginCheck: false,
		},
		logger: {
			log: (level, message, ...args) =>
				log[level]({ args }, `auth: ${message}`),
		},
	});
}

export type Auth = ReturnType<typeof createAuth>;
