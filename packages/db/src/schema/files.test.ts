import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "../testing/database.ts";
import { insertUser } from "../testing/factories.ts";

const db = createTestDb();
afterAll(() => db.$client.end());

describe("files", () => {
	// Raw SQL: Drizzle's types already refuse to leave it out.
	it("refuses a file without an organization", async () => {
		const user = await insertUser(db);
		await expect(
			db.execute(
				sql`insert into files (user_id, file_name, content_type, size_bytes, storage_key)
				values (${user.id}, 'n.txt', 'text/plain', 1, 'k')`,
			),
		).rejects.toMatchObject({ cause: { code: "23502" } }); // not_null_violation
	});
});
