import { jobs } from "@launchpad/db";
import { createTestDb } from "@launchpad/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { EmailDriver } from "#lib/email/driver.ts";
import { createMemoryDriver } from "#lib/email/memory-driver.ts";
import { createLogger } from "#lib/logger.ts";
import { enqueue } from "./enqueue.ts";
import { startWorker, type Worker } from "./worker.ts";

const db = createTestDb();
const log = createLogger("silent");
afterAll(() => db.$client.end());

let worker: Worker | undefined;
afterEach(async () => {
	await worker?.stop();
	worker = undefined;
});

const welcome = {
	template: "welcome",
	to: "ada@example.com",
	props: { name: "Ada" },
} as const;

const jobStatus = async (id: string) =>
	(await db.select().from(jobs).where(eq(jobs.id, id)))[0]?.status;

describe("send_email", () => {
	// The key is the job id, so every retry of this job reuses it and the provider delivers the email once.
	it("sends the rendered email through the driver, keyed by the job id", async () => {
		const email = createMemoryDriver();
		worker = await startWorker({ db, log, email });

		const id = await enqueue(db, "send_email", welcome);
		await vi.waitFor(() => expect(email.sent).toHaveLength(1));

		expect(email.sent[0]).toMatchObject({
			to: "ada@example.com",
			subject: "Welcome to Launchpad",
			idempotencyKey: id,
		});
		expect(email.sent[0]?.text).toMatch(/welcome, ada/i);
		await vi.waitFor(async () => expect(await jobStatus(id)).toBe("done"));
	});

	it("rejects a bad message in the request that queues it, not later in the worker", async () => {
		await expect(
			enqueue(db, "send_email", { ...welcome, to: "not-an-address" }),
		).rejects.toThrow();
		await expect(
			// @ts-expect-error: no such template
			enqueue(db, "send_email", { ...welcome, template: "nope" }),
		).rejects.toThrow();
		expect(await db.select().from(jobs)).toHaveLength(0);
	});

	it("retries when the provider fails", async () => {
		const failing: EmailDriver = {
			send: async () => {
				throw new Error("provider unavailable");
			},
		};
		worker = await startWorker({ db, log, email: failing });

		const id = await enqueue(db, "send_email", welcome);
		await vi.waitFor(async () => {
			const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
			expect(job).toMatchObject({
				status: "queued",
				attempts: 1,
				lastError: "Error: provider unavailable",
			});
		});
	});
});
