import {
	type Database,
	emailSuppressions,
	type SuppressionReason,
} from "@launchpad/db";
import { eq } from "drizzle-orm";

// Records an address we must not email again. A second report for the same address keeps the first: a
// provider can send the same event more than once (it retries until we answer 2xx).
export async function suppress(
	db: Database,
	email: string,
	reason: SuppressionReason,
): Promise<void> {
	await db
		.insert(emailSuppressions)
		.values({ email, reason })
		.onConflictDoNothing();
}

// Why this address is suppressed, or undefined when we may email it. Case-insensitive (citext).
export async function suppressionReason(
	db: Database,
	email: string,
): Promise<SuppressionReason | undefined> {
	const [row] = await db
		.select({ reason: emailSuppressions.reason })
		.from(emailSuppressions)
		.where(eq(emailSuppressions.email, email));
	return row?.reason;
}
