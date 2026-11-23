import { reportError } from "#lib/sentry.ts";
import { JOBS_CHANNEL } from "./constants.ts";
import { handlers as defaultHandlers } from "./handlers.ts";
import { claimJob, completeJob, failJob, releaseJob } from "./queue.ts";
import { type JobType, jobTypes } from "./schemas.ts";
import type {
	ClaimedJob,
	JobHandlers,
	Worker,
	WorkerOptions,
} from "./types.ts";

const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_SHUTDOWN_GRACE_MS = 20_000;

const message = (err: unknown) =>
	err instanceof Error ? `${err.name}: ${err.message}` : String(err);

// One job at a time. For more throughput, run more worker processes: claims never collide.
export async function startWorker({
	db,
	log,
	email,
	storage,
	handlers = defaultHandlers,
	leaseMs = DEFAULT_LEASE_MS,
	pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
	shutdownGraceMs = DEFAULT_SHUTDOWN_GRACE_MS,
}: WorkerOptions): Promise<Worker> {
	const stopping = new AbortController();

	// A wake-up that arrives while a job runs is remembered, so the worker doesn't sleep through it.
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

	// postgres.js reconnects LISTEN and calls the third argument: sweep for jobs queued meanwhile.
	const listener = await db.$client.listen(JOBS_CHANNEL, wake, wake);

	async function run(job: ClaimedJob): Promise<void> {
		const jobLog = log.child({
			jobId: job.id,
			jobType: job.type,
			attempt: job.attempts,
		});
		const started = performance.now();

		// Rows outlive code: a removed type, or a payload from an older schema. Retrying can't fix either.
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

		// `type` and `parsed.data` match, which TS can't follow here.
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
				storage,
				log: jobLog,
				signal,
			});
		} catch (err) {
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
				// Most likely the database is down. A job we held is retaken once its lease expires.
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
				// The handler ignored its signal: don't release it (it may still run); its lease hands it on.
				log.warn("job still running at shutdown; its lease will hand it on");
			}
			clearTimeout(timer);
			await listener.unlisten();
			log.info("worker stopped");
		},
	};
}
