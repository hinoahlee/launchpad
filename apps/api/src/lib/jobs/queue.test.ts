import { jobs } from "@launchpad/db";
import { createTestDb } from "@launchpad/db/testing";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { enqueue } from "./enqueue.ts";
import {
	backoffMs,
	type ClaimedJob,
	claimJob,
	completeJob,
	failJob,
	MAX_ATTEMPTS,
	releaseJob,
} from "./queue.ts";

const db = createTestDb();
afterAll(() => db.$client.end());

const LEASE_MS = 60_000;

const getJob = async (id: string) => {
	const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
	if (!job) throw new Error(`job ${id} not found`);
	return job;
};

// What a crash looks like from the database: the worker never came back, and its lease ran out.
const expireLease = (id: string) =>
	db
		.update(jobs)
		.set({ leaseExpiresAt: sql`now() - interval '1 second'` })
		.where(eq(jobs.id, id));

// For tests where a job must be there and is used next (failJob(db, await claimOrThrow(), ...)): the result is
// typed non-null. Where null is a possible answer, tests call claimJob itself.
const claimOrThrow = async () => {
	const job = await claimJob(db, LEASE_MS);
	if (!job) throw new Error("expected a job to claim");
	return job;
};

// Seconds between the database's now() and `date`.
const secondsFromNow = async (date: Date | null) => {
	const [row] = await db.execute<{ now: string }>(sql`select now() as now`);
	return ((date?.getTime() ?? 0) - new Date(row?.now ?? 0).getTime()) / 1000;
};

describe("backoffMs", () => {
	it("doubles after each failure and stops at an hour", () => {
		expect([1, 2, 3, 4, 5].map(backoffMs)).toEqual([
			10_000, 20_000, 40_000, 80_000, 160_000,
		]);
		expect(backoffMs(20)).toBe(60 * 60 * 1000);
	});
});

describe("claimJob", () => {
	it("returns null when nothing is queued", async () => {
		expect(await claimJob(db, LEASE_MS)).toBeNull();
	});

	it("takes a due job: running, first attempt, leased", async () => {
		const id = await enqueue(db, "echo", { message: "hi" });
		const job = await claimOrThrow();
		expect(job).toEqual({
			id,
			type: "echo",
			payload: { message: "hi" },
			attempts: 1,
		});
		const row = await getJob(id);
		expect(row.status).toBe("running");
		expect(await secondsFromNow(row.leaseExpiresAt)).toBeCloseTo(60, 0);
	});

	it("leaves a delayed job alone until its time", async () => {
		await enqueue(
			db,
			"echo",
			{ message: "later" },
			{ runAfter: new Date(Date.now() + 60_000) },
		);
		expect(await claimJob(db, LEASE_MS)).toBeNull();
	});

	it("gives each job to exactly one of many workers claiming at once", async () => {
		for (const n of [1, 2, 3]) {
			await enqueue(db, "echo", { message: `job ${n}` });
		}
		// 10 claims in parallel, each on its own connection (the pool holds 10).
		const claims = await Promise.all(
			Array.from({ length: 10 }, () => claimJob(db, LEASE_MS)),
		);
		const ids = claims.flatMap((job) => (job ? [job.id] : []));
		expect(ids).toHaveLength(3);
		expect(new Set(ids).size).toBe(3);
	});

	it("skips a row another worker has locked instead of waiting for it", async () => {
		const first = await enqueue(db, "echo", { message: "locked" });
		const second = await enqueue(db, "echo", { message: "free" });

		// Two gates: promises we resolve by hand. `lockTaken` opens once the other worker holds its lock;
		// `finishOther` keeps that worker's transaction (and so its lock) open until we open it.
		const lockTaken = Promise.withResolvers<void>();
		const finishOther = Promise.withResolvers<void>();

		// Another worker in the middle of claiming `first`. Not awaited: it runs alongside this test, and only
		// finishes once we open `finishOther` (awaiting it here would wait forever).
		const otherWorker = db.transaction(async (tx) => {
			await tx.select().from(jobs).where(eq(jobs.id, first)).for("update");
			lockTaken.resolve();
			await finishOther.promise;
		});
		await lockTaken.promise;

		try {
			// Without SKIP LOCKED, this would wait on `first`'s lock instead of answering.
			expect(await claimJob(db, LEASE_MS)).toMatchObject({ id: second });
			// `first` is locked, `second` is now running: nothing left to take.
			expect(await claimJob(db, LEASE_MS)).toBeNull();
		} finally {
			finishOther.resolve();
			await otherWorker;
		}
	});
});

describe("failJob (retries)", () => {
	it("queues a retry after the backoff and records the error", async () => {
		const id = await enqueue(db, "echo", { message: "flaky" });
		const job = await claimOrThrow();
		expect(await failJob(db, job, "Error: timeout")).toBe("retry");

		const row = await getJob(id);
		expect(row).toMatchObject({
			status: "queued",
			attempts: 1,
			leaseExpiresAt: null,
			lastError: "Error: timeout",
		});
		expect(await secondsFromNow(row.runAfter)).toBeCloseTo(10, 0);
		// Not due yet: the backoff holds it back.
		expect(await claimJob(db, LEASE_MS)).toBeNull();
	});

	it("waits longer after each failure", async () => {
		const id = await enqueue(db, "echo", { message: "flaky" });
		await failJob(db, await claimOrThrow(), "first");
		await db.update(jobs).set({ runAfter: sql`now()` }).where(eq(jobs.id, id));
		await failJob(db, await claimOrThrow(), "second");
		expect(await secondsFromNow((await getJob(id)).runAfter)).toBeCloseTo(
			20,
			0,
		);
	});

	it("marks the job failed once it has used its last attempt", async () => {
		const id = await enqueue(db, "echo", { message: "broken" });
		await db
			.update(jobs)
			.set({ attempts: MAX_ATTEMPTS - 1 })
			.where(eq(jobs.id, id));
		const job = await claimOrThrow();
		expect(job.attempts).toBe(MAX_ATTEMPTS);

		expect(await failJob(db, job, "still broken")).toBe("failed");
		expect(await getJob(id)).toMatchObject({
			status: "failed",
			lastError: "still broken",
		});
	});

	it("fails at once when retrying can't help", async () => {
		const id = await enqueue(db, "echo", { message: "x" });
		expect(
			await failJob(db, await claimOrThrow(), "unknown job type", {
				permanent: true,
			}),
		).toBe("failed");
		expect((await getJob(id)).status).toBe("failed");
	});
});

describe("leases", () => {
	it("lets another worker take a job whose lease expired (its worker crashed)", async () => {
		const id = await enqueue(db, "echo", { message: "orphan" });
		await claimOrThrow();
		// Still leased: no one else may take it.
		expect(await claimJob(db, LEASE_MS)).toBeNull();

		await expireLease(id);
		const retaken = await claimOrThrow();
		expect(retaken).toMatchObject({ id, attempts: 2 });
	});

	it("gives up on an expired job that has no attempts left", async () => {
		const id = await enqueue(db, "echo", { message: "orphan" });
		await db
			.update(jobs)
			.set({ attempts: MAX_ATTEMPTS - 1 })
			.where(eq(jobs.id, id));
		await claimOrThrow();
		await expireLease(id);

		expect(await claimJob(db, LEASE_MS)).toBeNull();
		expect(await getJob(id)).toMatchObject({
			status: "failed",
			lastError: "lease expired",
		});
	});

	it("doesn't wait on an abandoned job another worker is sweeping", async () => {
		const abandoned = await enqueue(db, "echo", { message: "orphan" });
		await db
			.update(jobs)
			.set({ attempts: MAX_ATTEMPTS - 1 })
			.where(eq(jobs.id, abandoned));
		await claimOrThrow();
		await expireLease(abandoned);
		const fresh = await enqueue(db, "echo", { message: "fresh" });

		// Another worker in the middle of sweeping `abandoned`: it holds that row's lock until we let it finish.
		const lockTaken = Promise.withResolvers<void>();
		const finishOther = Promise.withResolvers<void>();
		const otherWorker = db.transaction(async (tx) => {
			await tx.select().from(jobs).where(eq(jobs.id, abandoned)).for("update");
			lockTaken.resolve();
			await finishOther.promise;
		});
		await lockTaken.promise;

		try {
			// Without SKIP LOCKED in the sweep, this would wait on the locked row and time out.
			expect(await claimJob(db, LEASE_MS)).toMatchObject({ id: fresh });
			// Skipped, not swept: it's still the other worker's to handle.
			expect((await getJob(abandoned)).status).toBe("running");
		} finally {
			finishOther.resolve();
			await otherWorker;
		}

		// Once the lock is gone, the next claim sweeps it.
		expect(await claimJob(db, LEASE_MS)).toBeNull();
		expect((await getJob(abandoned)).status).toBe("failed");
	});
});

describe("fencing", () => {
	// Worker A claims, stalls past its lease (a long GC pause, a hung call), and B takes the job over.
	async function staleAndCurrent(): Promise<[ClaimedJob, ClaimedJob]> {
		const id = await enqueue(db, "echo", { message: "contested" });
		const stale = await claimOrThrow();
		await expireLease(id);
		const current = await claimOrThrow();
		return [stale, current];
	}

	it("ignores a stale worker's complete, fail and release", async () => {
		const [stale, current] = await staleAndCurrent();
		expect(stale.attempts).toBe(1);
		expect(current.attempts).toBe(2);

		expect(await completeJob(db, stale)).toBe(false);
		expect(await failJob(db, stale, "late failure")).toBe("stale");
		expect(await releaseJob(db, stale)).toBe(false);

		// B's claim is untouched.
		expect(await getJob(stale.id)).toMatchObject({
			status: "running",
			attempts: 2,
			lastError: null,
		});
	});

	it("accepts the current worker's result", async () => {
		const [, current] = await staleAndCurrent();
		expect(await completeJob(db, current)).toBe(true);
		expect((await getJob(current.id)).status).toBe("done");
		// Once done, no one can change it: not even the worker that finished it.
		expect(await failJob(db, current, "too late")).toBe("stale");
	});
});

describe("releaseJob", () => {
	it("hands the job back due now, without spending its attempt", async () => {
		const id = await enqueue(db, "echo", { message: "interrupted" });
		expect(await releaseJob(db, await claimOrThrow())).toBe(true);
		expect(await getJob(id)).toMatchObject({
			status: "queued",
			attempts: 0,
			leaseExpiresAt: null,
		});
		expect((await claimOrThrow()).attempts).toBe(1);
	});
});
