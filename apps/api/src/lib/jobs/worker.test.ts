import { jobs } from "@launchpad/db";
import { createTestDb } from "@launchpad/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "#lib/logger.ts";
import { enqueue } from "./enqueue.ts";
import { handlers, type JobHandlers } from "./handlers.ts";
import { startWorker, type Worker, type WorkerOptions } from "./worker.ts";

const db = createTestDb();
const log = createLogger("silent");
afterAll(() => db.$client.end());

let worker: Worker | undefined;
afterEach(async () => {
	await worker?.stop();
	worker = undefined;
});

// A long poll by default: a job that finishes quickly was woken by NOTIFY, not found by polling.
async function start(
	echo: JobHandlers["echo"],
	options: Partial<WorkerOptions> = {},
): Promise<Worker> {
	worker = await startWorker({
		db,
		log,
		handlers: { ...handlers, echo },
		pollIntervalMs: 60_000,
		...options,
	});
	return worker;
}

const getJob = async (id: string) => {
	const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
	if (!job) throw new Error(`job ${id} not found`);
	return job;
};

const waitForJob = (id: string, expected: Partial<typeof jobs.$inferSelect>) =>
	vi.waitFor(async () => expect(await getJob(id)).toMatchObject(expected), {
		timeout: 3_000,
		interval: 20,
	});

describe("worker", () => {
	it("runs a job as soon as it's queued (woken by NOTIFY)", async () => {
		const seen: string[] = [];
		await start(async ({ message }) => {
			seen.push(message);
		});

		const id = await enqueue(db, "echo", { message: "hi" });
		await waitForJob(id, { status: "done", attempts: 1 });
		expect(seen).toEqual(["hi"]);
	});

	it("finds jobs by polling when no notification comes", async () => {
		await start(async () => {}, { pollIntervalMs: 50 });
		// A plain insert sends no NOTIFY: only the poll can find it.
		const [job] = await db
			.insert(jobs)
			.values({ type: "echo", payload: { message: "quiet" } })
			.returning();
		await waitForJob(job?.id ?? "", { status: "done" });
	});

	it("doesn't run a job queued in a transaction that rolled back", async () => {
		const seen: string[] = [];
		await start(async ({ message }) => {
			seen.push(message);
		});
		await db
			.transaction(async (tx) => {
				await enqueue(tx, "echo", { message: "never" });
				throw new Error("rollback");
			})
			.catch(() => {});
		const id = await enqueue(db, "echo", { message: "after" });
		await waitForJob(id, { status: "done" });
		expect(seen).toEqual(["after"]);
	});

	it("schedules a retry when the handler throws", async () => {
		await start(async () => {
			throw new Error("smtp down");
		});
		const id = await enqueue(db, "echo", { message: "hi" });
		await waitForJob(id, {
			status: "queued",
			attempts: 1,
			lastError: "Error: smtp down",
		});
	});

	it("aborts a handler that outlives its lease, and counts it as a failure", async () => {
		await start(
			(_, { signal }) =>
				new Promise((_resolve, reject) => {
					signal.addEventListener("abort", () => reject(signal.reason));
				}),
			{ leaseMs: 100 },
		);
		const id = await enqueue(db, "echo", { message: "slow" });
		await waitForJob(id, { status: "queued", attempts: 1 });
		expect((await getJob(id)).lastError).toMatch(/^TimeoutError/);
	});

	it("fails a job of an unknown type or with a bad payload, without retrying", async () => {
		await start(async () => {}, { pollIntervalMs: 50 });
		const inserted = await db
			.insert(jobs)
			.values([
				{ type: "removed-type", payload: {} },
				{ type: "echo", payload: { wrong: true } },
			])
			.returning();
		const [unknown, invalid] = inserted.map((job) => job.id);
		await waitForJob(unknown ?? "", {
			status: "failed",
			lastError: "unknown job type",
		});
		await waitForJob(invalid ?? "", {
			status: "failed",
			lastError: "invalid payload",
		});
	});
});

describe("worker shutdown", () => {
	it("hands the running job back on stop, without spending its attempt", async () => {
		let started = () => {};
		const running = new Promise<void>((resolve) => {
			started = resolve;
		});
		const w = await start(
			(_, { signal }) =>
				new Promise((_resolve, reject) => {
					started();
					signal.addEventListener("abort", () => reject(signal.reason));
				}),
		);
		const id = await enqueue(db, "echo", { message: "long" });
		await running;

		await w.stop();
		expect(await getJob(id)).toMatchObject({
			status: "queued",
			attempts: 0,
			leaseExpiresAt: null,
		});
	});

	it("leaves a job to its lease when the handler ignores the stop signal", async () => {
		let started = () => {};
		const running = new Promise<void>((resolve) => {
			started = resolve;
		});
		let finish = () => {};
		const w = await start(
			() =>
				new Promise<void>((resolve) => {
					started();
					finish = resolve;
				}),
			{ shutdownGraceMs: 100 },
		);
		const id = await enqueue(db, "echo", { message: "stubborn" });
		await running;

		await w.stop();
		// Still `running` under this worker's claim: releasing it could let a second copy start while this one
		// is still going. Its lease expiring hands it on safely.
		expect(await getJob(id)).toMatchObject({ status: "running", attempts: 1 });
		finish();
		await waitForJob(id, { status: "done" });
	});
});
