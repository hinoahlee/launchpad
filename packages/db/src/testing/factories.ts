import type { Database, Transaction } from "../client.ts";
import { type NewUser, type User, users } from "../schema/users.ts";

// A valid user with unique defaults: pass only the fields the test is about.
let sequence = 0;
export async function insertUser(
	db: Database | Transaction,
	overrides: Partial<NewUser> = {},
): Promise<User> {
	sequence += 1;
	const [user] = await db
		.insert(users)
		.values({
			email: `user${sequence}@example.test`,
			name: `User ${sequence}`,
			...overrides,
		})
		.returning();
	if (!user) throw new Error("insert returned no row");
	return user;
}
