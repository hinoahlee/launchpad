import { jobs, users } from "@launchpad/db";
import { createTestDb, insertUser } from "@launchpad/db/testing";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { enqueue } from "./enqueue.ts";

const db = createTestDb();
afterAll(() => db.$client.end());

describe("enqueue", () => {
	it("queues a job that runs now, with its payload and no attempts yet", async () => {
		const before = new Date();
		const id = await enqueue(db, "echo", { message: "hi" });

		const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
		expect(job).toMatchObject({
			type: "echo",
			payload: { message: "hi" },
			status: "queued",
			attempts: 0,
			leaseExpiresAt: null,
			lastError: null,
		});
		// The database's clock, not ours: allow a second of drift between the two.
		expect(job?.runAfter.getTime()).toBeGreaterThan(before.getTime() - 1_000);
	});

	it("keeps runAfter when the job is delayed", async () => {
		const runAfter = new Date("2030-01-01T00:00:00.000Z");
		const id = await enqueue(db, "echo", { message: "later" }, { runAfter });
		const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
		expect(job?.runAfter).toEqual(runAfter);
	});

	it("commits the job together with the caller's data", async () => {
		await db.transaction(async (tx) => {
			const user = await insertUser(tx);
			await enqueue(tx, "echo", { message: `welcome ${user.id}` });
		});
		expect(await db.$count(users)).toBe(1);
		expect(await db.$count(jobs)).toBe(1);
	});

	it("leaves no job when the caller's transaction rolls back", async () => {
		await expect(
			db.transaction(async (tx) => {
				const user = await insertUser(tx);
				await enqueue(tx, "echo", { message: `welcome ${user.id}` });
				// Any error after the enqueue: the user and the job vanish together.
				throw new Error("payment declined");
			}),
		).rejects.toThrow("payment declined");

		expect(await db.$count(users)).toBe(0);
		expect(await db.$count(jobs)).toBe(0);
	});

	it("rejects a payload that doesn't match the type's schema, writing nothing", async () => {
		// Compiles (a string), but min(1) only runs at runtime.
		await expect(enqueue(db, "echo", { message: "" })).rejects.toBeInstanceOf(
			ZodError,
		);
		expect(await db.$count(jobs)).toBe(0);
	});

	// Each @ts-expect-error also makes `pnpm typecheck` fail if the compiler stops catching the mistake.
	it("refuses unknown types and missing fields at compile time too", async () => {
		// @ts-expect-error: no such job type
		await expect(enqueue(db, "no-such-job", {})).rejects.toThrow();
		// @ts-expect-error: payload is missing `message`
		await expect(enqueue(db, "echo", {})).rejects.toBeInstanceOf(ZodError);
		expect(await db.$count(jobs)).toBe(0);
	});

	it("rejects an unknown status in the database itself, even from raw SQL", async () => {
		await expect(
			db.execute(
				sql`insert into jobs (type, payload, status) values ('echo', '{}', 'finished')`,
			),
		).rejects.toMatchObject({ cause: { code: "23514" } }); // check_violation
	});
});
