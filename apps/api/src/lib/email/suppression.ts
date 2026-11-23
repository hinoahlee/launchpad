import {
	type Database,
	emailSuppressions,
	type SuppressionReason,
} from "@launchpad/db";
import { eq } from "drizzle-orm";

// A repeated report keeps the first: providers retry until they get a 2xx.
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

// undefined: we may email it. Case-insensitive (citext).
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
