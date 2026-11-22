import { randomUUID } from "node:crypto";
import { type Database, members, organizations, users } from "@launchpad/db";
import { and, asc, eq, inArray, ne, notInArray } from "drizzle-orm";

export const PERSONAL_ORGANIZATION_NAME = "Personal";

// The organization a new session starts in: the user's oldest membership. A user with none (their first sign-in,
// or they deleted every organization they had) gets a "Personal" one they own, so every signed-in user always
// has somewhere to work. Called by Better Auth before it inserts a session (databaseHooks in auth.ts).
export async function initialOrganizationId(
	db: Database,
	userId: string,
): Promise<string> {
	return db.transaction(async (tx) => {
		// Locks the user's row until commit: two sign-ins at once (two tabs, a double click) queue here, and the
		// second sees the organization the first created instead of making another.
		await tx
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, userId))
			.for("update");

		const [oldest] = await tx
			.select({ organizationId: members.organizationId })
			.from(members)
			.where(eq(members.userId, userId))
			.orderBy(asc(members.createdAt))
			.limit(1);
		if (oldest) return oldest.organizationId;

		const [organization] = await tx
			.insert(organizations)
			// A random slug: one derived from the user (their id, their name) could be taken first by someone else
			// creating an organization with that slug, and this insert would then fail on every sign-in.
			.values({
				name: PERSONAL_ORGANIZATION_NAME,
				slug: `personal-${randomUUID()}`,
			})
			.returning({ id: organizations.id });
		if (!organization) throw new Error("personal organization not created");
		await tx
			.insert(members)
			.values({ organizationId: organization.id, userId, role: "owner" });
		return organization.id;
	});
}

// Before deleting a user: delete the organizations they are the only member of. Their membership rows go with
// the user (ON DELETE CASCADE), and these would be left with nobody able to open them.
export async function deleteSoleMemberOrganizations(
	db: Database,
	userId: string,
): Promise<void> {
	const theirs = db
		.select({ id: members.organizationId })
		.from(members)
		.where(eq(members.userId, userId));
	const withOthers = db
		.select({ id: members.organizationId })
		.from(members)
		.where(
			and(inArray(members.organizationId, theirs), ne(members.userId, userId)),
		);
	await db
		.delete(organizations)
		.where(
			and(
				inArray(organizations.id, theirs),
				notInArray(organizations.id, withOthers),
			),
		);
}
