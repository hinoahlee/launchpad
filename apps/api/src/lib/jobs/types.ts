import type { Database } from "@launchpad/db";
import type { Logger } from "pino";
import type { EmailDriver } from "#lib/email/driver/types.ts";
import type { StorageDriver } from "#lib/storage/driver/types.ts";
import type { JobInput, JobPayload, JobType } from "./schemas.ts";

export type JobContext = {
	jobId: string;
	db: Database;
	email: EmailDriver;
	storage: StorageDriver | undefined;
	// Tagged with jobId, jobType and attempt.
	log: Logger;
	// Aborted on shutdown or when the lease runs out: pass it to slow calls.
	signal: AbortSignal;
};

export type JobHandler<T extends JobType> = (
	payload: JobPayload<T>,
	ctx: JobContext,
) => Promise<void>;

// Delivery is at-least-once: a handler may run twice for one job (a crash after the work, before "done").
// Every handler must be idempotent.
export type JobHandlers = { [T in JobType]: JobHandler<T> };

// A row a worker has claimed.
export type ClaimedJob = {
	id: string;
	type: string;
	payload: unknown;
	// The fencing token: each claim of a job gets a higher one.
	attempts: number;
};

// A recurring job. Cron: five fields, "minute hour day-of-month month day-of-week", read in UTC.
//   "0 * * * *"    every hour, on the hour
//   "*/15 * * * *" every 15 minutes
//   "30 3 * * 1"   Mondays at 03:30
export type Schedule<T extends JobType = JobType> = {
	// Part of each run's key: renaming a schedule makes it run once more.
	name: string;
	cron: string;
	type: T;
	payload: JobInput<T>;
};

export type WorkerOptions = {
	db: Database;
	log: Logger;
	email: EmailDriver;
	storage?: StorageDriver | undefined;
	handlers?: JobHandlers;
	// A handler must finish within it (no renewal); then its signal aborts and another worker may take the job.
	leaseMs?: number;
	// Catches delayed jobs, retries, expired leases and notifications missed while LISTEN was down.
	pollIntervalMs?: number;
	shutdownGraceMs?: number;
};

export type Worker = { stop: () => Promise<void> };
