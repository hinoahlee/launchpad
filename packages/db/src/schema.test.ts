import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { users } from "./schema.ts";
import { createTestDb, insertUser } from "./testing/index.ts";

const db = createTestDb();
afterAll(() => db.$client.end());

describe("users", () => {
	it("generates the id and both timestamps", async () => {
		const user = await insertUser(db);
		expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
		expect(user.createdAt).toBeInstanceOf(Date);
		expect(user.updatedAt).toEqual(user.createdAt);
	});

	it("rejects an email that differs only in case (citext unique)", async () => {
		await insertUser(db, { email: "Bob@Example.com" });
		// Drizzle wraps the driver error; 23505 is Postgres' unique_violation code.
		await expect(
			insertUser(db, { email: "bob@example.com" }),
		).rejects.toMatchObject({ cause: { code: "23505" } });
	});

	it("finds an email in any case and keeps the casing it was stored with", async () => {
		await insertUser(db, { email: "Bob@Example.com" });
		const [found] = await db
			.select()
			.from(users)
			.where(eq(users.email, "BOB@EXAMPLE.COM"));
		expect(found?.email).toBe("Bob@Example.com");
	});

	it("round-trips a timestamp at millisecond precision", async () => {
		const at = new Date("2026-01-02T03:04:05.678Z");
		const user = await insertUser(db, { createdAt: at });
		expect(user.createdAt.toISOString()).toBe("2026-01-02T03:04:05.678Z");
	});

	it("moves updatedAt forward on update", async () => {
		const user = await insertUser(db, {
			updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		});
		const [updated] = await db
			.update(users)
			.set({ name: "Renamed" })
			.where(eq(users.id, user.id))
			.returning();
		expect(updated?.updatedAt.getTime()).toBeGreaterThan(
			user.updatedAt.getTime(),
		);
	});

	it("starts every test with empty tables", async () => {
		expect(await db.$count(users)).toBe(0);
	});
});

describe("files", () => {
	// Step 12.3: every file belongs to an organization. Raw SQL: Drizzle's types already refuse to leave it out.
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
