import { type Database, jobs } from "@launchpad/db";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { and, eq, gt, sql } from "drizzle-orm";

// Sign-in code emails one address may get per rolling hour, however many IPs ask (security review M1). Better
// Auth's own limit is per IP: a script spread over many IPs could otherwise flood one inbox, spend our email quota,
// and hurt the sending domain's reputation. 5 covers typos and "didn't arrive, send again".
export const SIGN_IN_CODES_PER_HOUR = 5;

const SEND_PATH = "/email-otp/send-verification-otp";

// How many sign-in code emails were queued for `email` in the last hour. The queued `send_email` jobs are the
// record (one per code), so no table of its own; prune-jobs keeps them for days, well past the hour.
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

// A Better Auth `before` hook: it runs before the endpoint, so a refused request never makes a code. (Checked
// inside sendVerificationOTP instead, Better Auth would already have replaced the code in the inbox with one
// nobody gets: an attacker could keep the person locked out.)
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
			return; // Better Auth answers bad bodies itself; other types send nothing (auth.ts).
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
