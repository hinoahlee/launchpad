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
	{ runAfter }: EnqueueOptions = {},
): Promise<string> {
	const parsed = jobTypes[type].parse(payload);
	const [job] = await tx
		.insert(jobs)
		.values({ type, payload: parsed, ...(runAfter && { runAfter }) })
		.returning({ id: jobs.id });
	if (!job) throw new Error("insert returned no row");
	// Wakes idle workers at once instead of at their next poll. Sent on commit; dropped on rollback.
	await notifyWorkers(tx);
	return job.id;
}
