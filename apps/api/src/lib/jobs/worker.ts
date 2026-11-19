import type { Database } from "@launchpad/db";
import type { Logger } from "pino";
import type { EmailDriver } from "#lib/email/driver.ts";
import { reportError } from "#lib/sentry.ts";
import { handlers as defaultHandlers, type JobHandlers } from "./handlers.ts";
import { type JobType, jobTypes } from "./job-types.ts";
import {
	type ClaimedJob,
	claimJob,
	completeJob,
	failJob,
	JOBS_CHANNEL,
	releaseJob,
} from "./queue.ts";

export type WorkerOptions = {
	db: Database;
	log: Logger;
	email: EmailDriver;
	handlers?: JobHandlers;
	// How long a claimed job is ours. A handler must finish within it; at the end its signal is aborted, and
	// another worker may take the job. There is no renewal: raise it if a job type needs longer.
	leaseMs?: number;
	// How often an idle worker checks for due jobs without a wake-up: delayed jobs and retries becoming due,
	// expired leases, and any notification missed while the LISTEN connection was down.
	pollIntervalMs?: number;
	// On stop: how long to wait for the running handler to finish or give up (deploy contract: exit in 25 s).
	shutdownGraceMs?: number;
};

export type Worker = { stop: () => Promise<void> };

const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_SHUTDOWN_GRACE_MS = 20_000;

const message = (err: unknown) =>
	err instanceof Error ? `${err.name}: ${err.message}` : String(err);

// Runs one job at a time until stop(). For more throughput, run more worker processes: claims never collide.
export async function startWorker({
	db,
	log,
	email,
	handlers = defaultHandlers,
	leaseMs = DEFAULT_LEASE_MS,
	pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
	shutdownGraceMs = DEFAULT_SHUTDOWN_GRACE_MS,
}: WorkerOptions): Promise<Worker> {
	const stopping = new AbortController();

	// Sleeping until the next poll, or until woken. A wake-up that arrives while a job runs is remembered,
	// so the worker looks again right after instead of sleeping through it.
	let wakePending = false;
	let wakeUp: (() => void) | undefined;
	const wake = () => {
		wakePending = true;
		wakeUp?.();
	};
	const idle = (ms: number) =>
		new Promise<void>((resolve) => {
			const done = () => {
				clearTimeout(timer);
				wakeUp = undefined;
				wakePending = false;
				resolve();
			};
			const timer = setTimeout(done, ms);
			wakeUp = done;
			if (wakePending) done();
		});

	// LISTEN holds one connection of its own. postgres.js reconnects it if it drops and then calls the third
	// argument again: we wake up to sweep for jobs queued while we weren't listening.
	const listener = await db.$client.listen(JOBS_CHANNEL, wake, wake);

	async function run(job: ClaimedJob): Promise<void> {
		const jobLog = log.child({
			jobId: job.id,
			jobType: job.type,
			attempt: job.attempts,
		});
		const started = performance.now();

		// Rows outlive code: a type removed since the job was queued, or a payload from an older schema.
		// Retrying can't fix either.
		const type = job.type as JobType;
		const parsed = Object.hasOwn(jobTypes, type)
			? jobTypes[type].safeParse(job.payload)
			: undefined;
		if (!parsed?.success) {
			const error = parsed ? "invalid payload" : "unknown job type";
			await failJob(db, job, error, { permanent: true });
			jobLog.error({ error }, "job failed");
			return;
		}

		// Each handler takes its own payload type; `type` and `parsed.data` match, which TS can't follow here.
		const handler = handlers[type] as (
			payload: unknown,
			ctx: Parameters<JobHandlers[JobType]>[1],
		) => Promise<void>;
		const signal = AbortSignal.any([
			stopping.signal,
			AbortSignal.timeout(leaseMs),
		]);

		try {
			await handler(parsed.data, {
				jobId: job.id,
				db,
				email,
				log: jobLog,
				signal,
			});
		} catch (err) {
			// Shutting down: the handler stopped, so hand the job back without spending an attempt.
			if (stopping.signal.aborted) {
				if (await releaseJob(db, job)) jobLog.info("job handed back");
				return;
			}
			const outcome = await failJob(db, job, message(err));
			if (outcome === "failed") {
				jobLog.error({ err }, "job failed");
				reportError(err, { jobId: job.id, jobType: job.type });
			} else if (outcome === "retry") {
				jobLog.warn({ err }, "job will retry");
			} else {
				jobLog.warn({ err }, "job taken over by another worker");
			}
			return;
		}

		const durationMs = Math.round(performance.now() - started);
		if (await completeJob(db, job)) {
			jobLog.info({ durationMs }, "job done");
		} else {
			// Our lease ran out and another worker claimed the job: its run is the one that counts.
			jobLog.warn({ durationMs }, "job taken over by another worker");
		}
	}

	async function loop(): Promise<void> {
		while (!stopping.signal.aborted) {
			try {
				const job = await claimJob(db, leaseMs);
				if (job) await run(job);
				else await idle(pollIntervalMs);
			} catch (err) {
				// The database is unreachable, most likely. A job we held stays `running` until its lease
				// expires, then another claim picks it up. Wait a poll and try again.
				log.error({ err }, "worker loop error");
				await idle(pollIntervalMs);
			}
		}
	}

	const loopDone = loop();
	log.info({ leaseMs, pollIntervalMs }, "worker started");

	return {
		async stop() {
			stopping.abort();
			wake();
			let timer: NodeJS.Timeout | undefined;
			const timedOut = new Promise<true>((resolve) => {
				timer = setTimeout(() => resolve(true), shutdownGraceMs);
			});
			if (await Promise.race([loopDone.then(() => false), timedOut])) {
				// The handler ignored its signal. Don't release the job (it may still be running): its lease
				// expires and another worker takes it, fenced off from this one.
				log.warn("job still running at shutdown; its lease will hand it on");
			}
			clearTimeout(timer);
			await listener.unlisten();
			log.info("worker stopped");
		},
	};
}
