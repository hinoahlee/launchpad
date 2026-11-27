import { type Database, jobs, type Transaction } from "@launchpad/db";
import { SIGN_IN_CODE_MINUTES } from "@launchpad/shared";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { and, eq, gt, sql } from "drizzle-orm";
import { enqueue } from "#lib/jobs/enqueue.ts";
import { SIGN_IN_CODES_PER_HOUR } from "./constants.ts";

const SEND_PATH = "/email-otp/send-verification-otp";

// The queued send_email jobs are the record of codes sent: no table of its own.
async function codesSentLastHour(
	db: Database | Transaction,
	email: string,
): Promise<number> {
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

// A `before` hook, not only the check in queueSignInCode: by then Better Auth has already replaced the code the
// person holds, so refusing there would let an attacker keep them locked out. This one refuses early.
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

// Queues the code email unless the address already got its hourly share. Parallel requests all pass the hook
// above before any of them queues; the lock per address makes the count and the insert one step, so the limit
// holds for what is actually sent. Returns false when it sent nothing.
export async function queueSignInCode(
	db: Database,
	email: string,
	code: string,
): Promise<boolean> {
	return db.transaction(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtext('sign-in-code:' || ${email.toLowerCase()}))`,
		);
		if ((await codesSentLastHour(tx, email)) >= SIGN_IN_CODES_PER_HOUR) {
			return false;
		}
		await enqueue(tx, "send_email", {
			template: "sign-in-code",
			to: email,
			props: { code, expiresInMinutes: SIGN_IN_CODE_MINUTES },
		});
		return true;
	});
}
