import { randomUUID } from "node:crypto";
import {
	type Database,
	members,
	organizations,
	type Transaction,
	users,
} from "@launchpad/db";
import { eq, inArray } from "drizzle-orm";
import { PERSONAL_ORGANIZATION_NAME } from "./constants.ts";

// The user's one organization, created with them as owner if they have none (first sign-in).
export async function initialOrganizationId(
	db: Database,
	userId: string,
): Promise<string> {
	return db.transaction(async (tx) => {
		// Two sign-ins at once queue here; the second sees the organization the first created.
		await tx
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, userId))
			.for("update");

		const [membership] = await tx
			.select({ organizationId: members.organizationId })
			.from(members)
			.where(eq(members.userId, userId));
		if (membership) return membership.organizationId;

		const [organization] = await tx
			.insert(organizations)
			// Random: a slug derived from the user would be guessable.
			.values({
				name: PERSONAL_ORGANIZATION_NAME,
				slug: `personal-${randomUUID()}`,
			})
			.returning({ id: organizations.id });
		if (!organization) throw new Error("organization not created");
		await tx
			.insert(members)
			.values({ organizationId: organization.id, userId, role: "owner" });
		return organization.id;
	});
}

// Deletes the user's organization (its rows cascade). `afterEach` runs in the same transaction: queue cleanup of
// what lives outside Postgres there, so it's queued if and only if the rows are gone.
export async function deleteUserOrganization(
	db: Database,
	userId: string,
	afterEach: (tx: Transaction, organizationId: string) => Promise<void>,
): Promise<void> {
	await db.transaction(async (tx) => {
		const deleted = await tx
			.delete(organizations)
			.where(
				inArray(
					organizations.id,
					tx
						.select({ id: members.organizationId })
						.from(members)
						.where(eq(members.userId, userId)),
				),
			)
			.returning({ id: organizations.id });
		for (const { id } of deleted) await afterEach(tx, id);
	});
}
