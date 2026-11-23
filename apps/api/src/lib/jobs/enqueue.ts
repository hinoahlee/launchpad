import { type Database, jobs, type Transaction } from "@launchpad/db";
import { notifyWorkers } from "./queue.ts";
import { type JobInput, type JobType, jobTypes } from "./schemas.ts";

type EnqueueOptions = {
	runAfter?: Date;
};

// Pass the `tx` of the transaction that saves the data the job is about: the job commits or rolls back with it
// (transactional outbox). The payload is validated here, so a bad one fails the caller, not the worker.
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

// false: a job with this key was already queued (`jobs.key` is unique), by this process or any other.
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
	const [job] = await tx
		.insert(jobs)
		.values({ type, payload: parsed, key, ...(runAfter && { runAfter }) })
		.onConflictDoNothing({ target: jobs.key })
		.returning({ id: jobs.id });
	if (!job) return undefined;
	// Postgres delivers it on commit and drops it on rollback.
	await notifyWorkers(tx);
	return job.id;
}
