import { type Database, jobs } from "@launchpad/db";
import { and, eq, sql } from "drizzle-orm";

// Account deletion: removes every send_email job addressed to `email`, whatever its status (failed ones are
// otherwise kept forever), so the address doesn't outlive the account in the queue. A worker running one of them
// finds its row gone and logs it; the email itself may still go out.
export async function forgetAddress(
	db: Database,
	email: string,
): Promise<void> {
	await db
		.delete(jobs)
		.where(
			and(
				eq(jobs.type, "send_email"),
				sql`lower(${jobs.payload}->>'to') = ${email.toLowerCase()}`,
			),
		);
}
