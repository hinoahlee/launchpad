import { type Database, jobs } from "@launchpad/db";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { and, eq, gt, sql } from "drizzle-orm";
import { SIGN_IN_CODES_PER_HOUR } from "./constants.ts";

const SEND_PATH = "/email-otp/send-verification-otp";

// The queued send_email jobs are the record of codes sent: no table of its own.
async function codesSentLastHour(db: Database, email: string): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(jobs)
		.where(
			and(
				eq(jobs.type, "send_email"),
				sql`${jobs.payload}->>'template' = 'sign-in-code'`,
				sql`lower(${jobs.payload}->>'to') = ${email.toLowerCase()}`,
				gt(jobs.createdAt, sql`now() - interval '1 hour'`),
			),
		);
	return row?.count ?? 0;
}

// A `before` hook, not a check in sendVerificationOTP: by then Better Auth has already replaced the code the
// person holds, so refusing there would let an attacker keep them locked out.
export function signInCodeLimit(db: Database) {
	return createAuthMiddleware(async (ctx) => {
		if (ctx.path !== SEND_PATH) return;
		const body: unknown = ctx.body;
		if (
			typeof body !== "object" ||
			body === null ||
			!("type" in body) ||
			body.type !== "sign-in" ||
			!("email" in body) ||
			typeof body.email !== "string"
		) {
			return;
		}
		if ((await codesSentLastHour(db, body.email)) >= SIGN_IN_CODES_PER_HOUR) {
			throw new APIError("TOO_MANY_REQUESTS", {
				code: "TOO_MANY_CODES",
				message:
					"Too many sign-in codes sent to this address. Try again later.",
			});
		}
	});
}
