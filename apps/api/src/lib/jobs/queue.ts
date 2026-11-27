import { type Database, jobs, type Transaction } from "@launchpad/db";
import { and, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import {
	JOBS_CHANNEL,
	MAX_ATTEMPTS,
	SECRET_PAYLOAD_PATHS,
} from "./constants.ts";
import type { ClaimedJob } from "./types.ts";

// What a worker does with a row. Every write after the claim is fenced: it applies only while the row is still
// `running` with the `attempts` value this worker claimed it with.

// 10 s, 20 s, 40 s... at most 1 hour.
const BACKOFF_BASE_MS = 10_000;
const BACKOFF_MAX_MS = 60 * 60 * 1000;

export function backoffMs(attempts: number): number {
	return Math.min(BACKOFF_BASE_MS * 2 ** (attempts - 1), BACKOFF_MAX_MS);
}

// The payload without its secret fields (a no-op for payloads that have none).
const withoutSecrets = SECRET_PAYLOAD_PATHS.reduce(
	(payload, path) => sql`(${payload} #- ${path}::text[])`,
	sql`${jobs.payload}`,
);

const afterMs = (ms: number) =>
	sql`now() + make_interval(secs => ${ms / 1000})`;

export async function notifyWorkers(db: Database | Transaction): Promise<void> {
	await db.execute(sql`select pg_notify(${JOBS_CHANNEL}, '')`);
}

// The next due job: queued with run_after passed, or running with an expired lease (its worker died).
// SKIP LOCKED: concurrent workers get different jobs and never wait on each other.
export async function claimJob(
	db: Database,
	leaseMs: number,
): Promise<ClaimedJob | null> {
	return db.transaction(async (tx) => {
		const leaseExpired = and(
			eq(jobs.status, "running"),
			lt(jobs.leaseExpiresAt, sql`now()`),
		);

		// 1. Expired leases with no attempts left: give up. SKIP LOCKED here too, or two sweeps could deadlock.
		await tx
			.update(jobs)
			.set({
				status: "failed",
				leaseExpiresAt: null,
				lastError: "lease expired",
				payload: withoutSecrets,
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

		// 2. Pick and lock the next due job until this transaction commits.
		const [due] = await tx
			.select({ id: jobs.id })
			.from(jobs)
			.where(
				or(
					and(eq(jobs.status, "queued"), lte(jobs.runAfter, sql`now()`)),
					and(leaseExpired, lt(jobs.attempts, MAX_ATTEMPTS)),
				),
			)
			.orderBy(jobs.runAfter)
			.limit(1)
			.for("update", { skipLocked: true });
		if (!due) return null;

		// 3. Claim it: a new fencing token and a fresh lease.
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

const current = (job: ClaimedJob) =>
	and(
		eq(jobs.id, job.id),
		eq(jobs.status, "running"),
		eq(jobs.attempts, job.attempts),
	);

// false: fenced off. Our lease ran out and another worker took the job.
export async function completeJob(
	db: Database | Transaction,
	job: ClaimedJob,
): Promise<boolean> {
	const done = await db
		.update(jobs)
		.set({
			status: "done",
			leaseExpiresAt: null,
			lastError: null,
			payload: withoutSecrets,
		})
		.where(current(job))
		.returning({ id: jobs.id });
	return done.length > 0;
}

type FailOutcome = "retry" | "failed" | "stale";

// `permanent`: fail now, retrying can't help (e.g. an unknown job type).
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
				? {
						status: "failed",
						leaseExpiresAt: null,
						lastError: error,
						payload: withoutSecrets,
					}
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

// Shutdown: hand the job back without spending an attempt. Only once the handler has stopped: the next claim
// reuses this attempts number, so a handler still running would pass the fence.
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

// `failed` jobs are kept for a human. Deleting old keys is safe: a schedule only queues its latest run.
export async function pruneDoneJobs(
	db: Database | Transaction,
	olderThanDays: number,
): Promise<number> {
	const deleted = await db
		.delete(jobs)
		.where(
			and(
				eq(jobs.status, "done"),
				lt(
					jobs.updatedAt,
					sql`now() - make_interval(days => ${olderThanDays})`,
				),
			),
		)
		.returning({ id: jobs.id });
	return deleted.length;
}
