import { files, jobs, organizations } from "@launchpad/db";
import { createTestDb, insertUser } from "@launchpad/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryDriver } from "#lib/email/driver/memory/driver.ts";
import type { EmailDriver } from "#lib/email/driver/types.ts";
import { suppress } from "#lib/email/suppression.ts";
import { createLogger } from "#lib/logger.ts";
import { createMemoryStorageDriver } from "#lib/storage/driver/memory/driver.ts";
import { storageKey } from "#lib/storage/keys.ts";
import { enqueue } from "./enqueue.ts";
import type { Worker } from "./types.ts";
import { startWorker } from "./worker.ts";

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

	it("skips an address that bounced or complained, and finishes the job", async () => {
		const email = createMemoryDriver();
		worker = await startWorker({ db, log, email });
		// Different case on purpose: it's the same mailbox.
		await suppress(db, "ADA@example.com", "bounce");

		const id = await enqueue(db, "send_email", welcome);
		await vi.waitFor(async () => expect(await jobStatus(id)).toBe("done"));
		expect(email.sent).toEqual([]);
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

describe("prune-uploads", () => {
	const hoursAgo = (hours: number) =>
		new Date(Date.now() - hours * 60 * 60 * 1000);

	async function insertFile(
		userId: string,
		{ createdAt, uploaded }: { createdAt: Date; uploaded: boolean },
	) {
		// Every file belongs to an organization; which one doesn't matter to this job.
		const [organization] = await db
			.insert(organizations)
			.values({ name: "Org", slug: crypto.randomUUID() })
			.returning();
		if (!organization) throw new Error("no organization");
		const key = storageKey(organization.id);
		await db.insert(files).values({
			organizationId: organization.id,
			userId,
			fileName: "f.txt",
			contentType: "text/plain",
			sizeBytes: 1,
			storageKey: key,
			createdAt,
			uploadedAt: uploaded ? createdAt : null,
		});
		return key;
	}

	it("deletes pending uploads older than a day, row and object; keeps recent and finished ones", async () => {
		const storage = createMemoryStorageDriver();
		worker = await startWorker({
			db,
			log,
			email: createMemoryDriver(),
			storage,
		});
		const user = await insertUser(db);
		const abandoned = await insertFile(user.id, {
			createdAt: hoursAgo(25),
			uploaded: false,
		});
		const recent = await insertFile(user.id, {
			createdAt: hoursAgo(1),
			uploaded: false,
		});
		const finished = await insertFile(user.id, {
			createdAt: hoursAgo(48),
			uploaded: true,
		});
		// The browser's PUT happened for the abandoned one; `complete` never came.
		for (const key of [abandoned, recent, finished])
			storage.objects.set(key, 1);

		const id = await enqueue(db, "prune-uploads", {});
		await vi.waitFor(async () => expect(await jobStatus(id)).toBe("done"));

		const left = (await db.select({ key: files.storageKey }).from(files)).map(
			(r) => r.key,
		);
		expect(left.sort()).toEqual([recent, finished].sort());
		// The rows go at once; each object goes in a delete-file-object job queued with its row's delete.
		await vi.waitFor(() =>
			expect([...storage.objects.keys()].sort()).toEqual(
				[recent, finished].sort(),
			),
		);
	});

	// Uploads off (no bucket): nothing to prune, so the hourly job must not fail.
	it("finishes without a bucket when there's nothing to prune", async () => {
		worker = await startWorker({ db, log, email: createMemoryDriver() });
		const id = await enqueue(db, "prune-uploads", {});
		await vi.waitFor(async () => expect(await jobStatus(id)).toBe("done"));
	});
});

describe("delete-organization-files", () => {
	// A worker without S3_* can't delete the objects: the job must fail visibly, not finish as if it had.
	it("fails, saying why, when the worker has no bucket", async () => {
		worker = await startWorker({ db, log, email: createMemoryDriver() });
		const id = await enqueue(db, "delete-organization-files", {
			organizationId: "00000000-0000-4000-8000-000000000000",
		});
		await vi.waitFor(async () => {
			const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
			expect(job?.lastError).toMatch(/no bucket configured on the worker/);
		});
	});
});
