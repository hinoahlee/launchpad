import { type Database, jobs, type Transaction } from "@launchpad/db";
import { type JobInput, type JobType, jobTypes } from "./job-types.ts";
import { notifyWorkers } from "./queue.ts";

export type EnqueueOptions = {
	// Don't run before this time (default: as soon as a worker is free).
	runAfter?: Date;
};

// Queues a job and returns its id. Pass the `tx` of the transaction that saves the data the job is about:
// the job row then commits or rolls back with that data, so a job never points at something that wasn't saved,
// and saved data never misses its job (the transactional outbox pattern).
// The payload is checked against its type's schema here, so a bad payload fails the caller, not the worker later.
export async function enqueue<T extends JobType>(
	tx: Database | Transaction,
	type: T,
	payload: JobInput<T>,
	options: EnqueueOptions = {},
): Promise<string> {
	const id = await insertJob(tx, type, payload, options);
	if (!id) throw new Error("insert returned no row");
	return id;
}

// Queues a job unless one with this `key` was ever queued (`jobs.key` is unique). Returns false when it already
// exists. Safe to call from many processes at once: the database keeps exactly one row per key.
export async function enqueueOnce<T extends JobType>(
	tx: Database | Transaction,
	key: string,
	type: T,
	payload: JobInput<T>,
	options: EnqueueOptions = {},
): Promise<boolean> {
	return (await insertJob(tx, type, payload, options, key)) !== undefined;
}

async function insertJob<T extends JobType>(
	tx: Database | Transaction,
	type: T,
	payload: JobInput<T>,
	{ runAfter }: EnqueueOptions,
	key?: string,
): Promise<string | undefined> {
	const parsed = jobTypes[type].parse(payload);
	// With a key, a duplicate inserts nothing and returns no row. Without one, there's nothing to conflict on.
	const [job] = await tx
		.insert(jobs)
		.values({ type, payload: parsed, key, ...(runAfter && { runAfter }) })
		.onConflictDoNothing({ target: jobs.key })
		.returning({ id: jobs.id });
	if (!job) return undefined;
	// Wakes idle workers at once instead of at their next poll. Sent on commit; dropped on rollback.
	await notifyWorkers(tx);
	return job.id;
}
