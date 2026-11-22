import { randomUUID } from "node:crypto";
import { type Database, members, organizations, users } from "@launchpad/db";
import { eq, inArray } from "drizzle-orm";

export const PERSONAL_ORGANIZATION_NAME = "Personal";

// The user's organization (decision 010: exactly one, which they own alone), made now if they have none: their
// first sign-in, or an earlier attempt that failed. Called by Better Auth before it inserts a session
// (databaseHooks in auth.ts), so every session has an organization.
export async function initialOrganizationId(
	db: Database,
	userId: string,
): Promise<string> {
	return db.transaction(async (tx) => {
		// Locks the user's row until commit: two sign-ins at once (two tabs, a double click) queue here, and the
		// second sees the organization the first created. (The unique index on members.user_id would refuse a second
		// one anyway, but as a failed sign-in.)
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

		// The organization and its owner in one transaction: an organization never exists without its member.
		const [organization] = await tx
			.insert(organizations)
			// A random slug: one derived from the user (their id, their name) would be guessable.
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

// Before deleting a user: delete their organization. Their membership row goes with the user (ON DELETE CASCADE);
// the organization would be left with no member, and nobody able to open it.
export async function deleteUserOrganization(
	db: Database,
	userId: string,
): Promise<void> {
	await db
		.delete(organizations)
		.where(
			inArray(
				organizations.id,
				db
					.select({ id: members.organizationId })
					.from(members)
					.where(eq(members.userId, userId)),
			),
		);
}
