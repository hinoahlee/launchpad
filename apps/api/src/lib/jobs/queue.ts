import { type Database, jobs, type Transaction } from "@launchpad/db";
import { and, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";

// The consumer side of the queue: what a worker does with a row. Every write after the claim is fenced: it
// only applies while the row is still `running` with the `attempts` value this worker claimed it with.

// The NOTIFY channel workers LISTEN on. Postgres delivers a notification when the transaction that sent it
// commits, and drops it on rollback, so a wake-up never arrives for a job that wasn't saved.
export const JOBS_CHANNEL = "jobs";

// After this many claims a failing job stops being retried and stays `failed` for a human to look at.
export const MAX_ATTEMPTS = 5;

// Exponential backoff: wait 10 s after the 1st failure, then 20 s, 40 s, 80 s..., at most 1 hour. Each retry
// waits twice as long, so a struggling dependency (an email API that's down) gets room to recover instead of
// being hammered.
const BACKOFF_BASE_MS = 10_000;
const BACKOFF_MAX_MS = 60 * 60 * 1000;

export function backoffMs(attempts: number): number {
	return Math.min(BACKOFF_BASE_MS * 2 ** (attempts - 1), BACKOFF_MAX_MS);
}

const afterMs = (ms: number) =>
	sql`now() + make_interval(secs => ${ms / 1000})`;

export async function notifyWorkers(db: Database | Transaction): Promise<void> {
	await db.execute(sql`select pg_notify(${JOBS_CHANNEL}, '')`);
}

export type ClaimedJob = {
	id: string;
	type: string;
	payload: unknown;
	// The fencing token: this claim's number. A later claim of the same job gets a higher one.
	attempts: number;
};

// Takes the next job that's due: a queued one whose run_after has passed, or a running one whose lease ran
// out (its worker crashed or hung). Returns null when there's nothing to do.
//
// FOR UPDATE SKIP LOCKED: lock the row we pick, and skip rows another worker has locked instead of waiting
// for them. Two workers asking at once get different jobs, never the same one.
export async function claimJob(
	db: Database,
	leaseMs: number,
): Promise<ClaimedJob | null> {
	return db.transaction(async (tx) => {
		const leaseExpired = and(
			eq(jobs.status, "running"),
			lt(jobs.leaseExpiresAt, sql`now()`),
		);

		// 1. Abandoned jobs that already used their last attempt: give up on them. Only rows no other worker has
		// locked (SKIP LOCKED again): a plain UPDATE would wait for another worker's sweep of the same rows, and
		// two sweeps locking rows in different orders could deadlock. A row we skip is swept by whoever holds
		// it, or by the next claim.
		await tx
			.update(jobs)
			.set({
				status: "failed",
				leaseExpiresAt: null,
				lastError: "lease expired",
			})
			.where(
				inArray(
					jobs.id,
					tx
						.select({ id: jobs.id })
						.from(jobs)
						.where(and(leaseExpired, gte(jobs.attempts, MAX_ATTEMPTS)))
						.for("update", { skipLocked: true }),
				),
			);

		// 2. Pick the next due job and lock its row. The lock is held until this transaction commits: long
		// enough for step 3 to mark it running. From then on, the status and lease keep other claims away.
		const [due] = await tx
			.select({ id: jobs.id })
			.from(jobs)
			.where(
				or(
					and(eq(jobs.status, "queued"), lte(jobs.runAfter, sql`now()`)),
					// Re-checked here: a lease can run out between step 1 and this query.
					and(leaseExpired, lt(jobs.attempts, MAX_ATTEMPTS)),
				),
			)
			.orderBy(jobs.runAfter)
			.limit(1)
			.for("update", { skipLocked: true });
		if (!due) return null;

		// 3. Claim it: a new attempt number (the fencing token) and a fresh lease.
		const [claimed] = await tx
			.update(jobs)
			.set({
				status: "running",
				attempts: sql`${jobs.attempts} + 1`,
				leaseExpiresAt: afterMs(leaseMs),
			})
			.where(eq(jobs.id, due.id))
			.returning({
				id: jobs.id,
				type: jobs.type,
				payload: jobs.payload,
				attempts: jobs.attempts,
			});
		if (!claimed) throw new Error("claimed job vanished under lock");
		return claimed;
	});
}

// Still ours: running, and no one has claimed it since we did.
const current = (job: ClaimedJob) =>
	and(
		eq(jobs.id, job.id),
		eq(jobs.status, "running"),
		eq(jobs.attempts, job.attempts),
	);

// false: the write was fenced off. Our lease ran out and another worker took the job; its result counts.
export async function completeJob(
	db: Database | Transaction,
	job: ClaimedJob,
): Promise<boolean> {
	const done = await db
		.update(jobs)
		.set({ status: "done", leaseExpiresAt: null, lastError: null })
		.where(current(job))
		.returning({ id: jobs.id });
	return done.length > 0;
}

export type FailOutcome = "retry" | "failed" | "stale";

// Records the error and schedules a retry after the backoff, or marks the job failed once it's out of
// attempts (or at once, with `permanent`: retrying can't help, e.g. a job type no handler knows).
export async function failJob(
	db: Database | Transaction,
	job: ClaimedJob,
	error: string,
	{ permanent = false }: { permanent?: boolean } = {},
): Promise<FailOutcome> {
	const giveUp = permanent || job.attempts >= MAX_ATTEMPTS;
	const [row] = await db
		.update(jobs)
		.set(
			giveUp
				? { status: "failed", leaseExpiresAt: null, lastError: error }
				: {
						status: "queued",
						runAfter: afterMs(backoffMs(job.attempts)),
						leaseExpiresAt: null,
						lastError: error,
					},
		)
		.where(current(job))
		.returning({ status: jobs.status });
	if (!row) return "stale";
	return row.status === "failed" ? "failed" : "retry";
}

// Hands an interrupted job back (the worker is shutting down) without spending its attempt: queued, due now.
// Only call it once the handler has stopped: the next claim reuses the same attempts number, so a handler
// still running could otherwise pass the fence.
export async function releaseJob(
	db: Database | Transaction,
	job: ClaimedJob,
): Promise<boolean> {
	const released = await db
		.update(jobs)
		.set({
			status: "queued",
			attempts: sql`${jobs.attempts} - 1`,
			runAfter: sql`now()`,
			leaseExpiresAt: null,
		})
		.where(current(job))
		.returning({ id: jobs.id });
	return released.length > 0;
}
