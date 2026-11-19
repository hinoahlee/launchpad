import type { Database } from "@launchpad/db";
import { Cron } from "croner";
import type { Logger } from "pino";
import { enqueueOnce } from "./enqueue.ts";
import { schedules as defaultSchedules, type Schedule } from "./schedules.ts";

// The scheduler turns schedules into jobs. It only queues them; the worker runs them like any other job.
//
// Every worker process runs one, so there's no single "scheduler server" to keep alive. They don't coordinate
// with each other: each run of a schedule has a key (its name + the time it's for), and `jobs.key` is unique, so
// whichever worker inserts first wins and the others' inserts do nothing. The run is a singleton job.
//
// Each tick queues only a schedule's latest run. A worker that was down at 10:00 and starts at 10:37 still
// queues the 10:00 run (once, unless someone already did), but never a backlog of every run it missed.

export type SchedulerOptions = {
	db: Database;
	log: Logger;
	schedules?: Schedule[];
	// How often to check. A run is queued at most this long after its time.
	tickMs?: number;
};

export type Scheduler = { stop: () => Promise<void> };

const DEFAULT_TICK_MS = 30_000;

type Parsed = Schedule & { pattern: Cron };

// Throws on an invalid cron expression or a repeated name, so a typo stops the worker at boot.
export function parseSchedules(schedules: Schedule[]): Parsed[] {
	const names = new Set<string>();
	return schedules.map((s) => {
		if (names.has(s.name)) throw new Error(`duplicate schedule "${s.name}"`);
		names.add(s.name);
		// No callback: croner only computes times, it doesn't start a timer of its own.
		return { ...s, pattern: new Cron(s.cron, { timezone: "UTC" }) };
	});
}

// The key of the run due at `runAt`, e.g. "prune-jobs:2026-01-01T10:00:00.000Z".
export const runKey = (name: string, runAt: Date) =>
	`${name}:${runAt.toISOString()}`;

// Queues the latest run of each schedule at or before `now`, unless it was already queued. Returns the keys
// it queued (empty when every run already existed).
export async function enqueueDueRuns(
	db: Database,
	schedules: Parsed[],
	now: Date,
): Promise<string[]> {
	const queued: string[] = [];
	for (const s of schedules) {
		// croner counts a run as past from the next whole second: at 10:00:00.5 the latest run is still 09:00
		// (already queued: nothing happens); the next tick queues 10:00.
		const [runAt] = s.pattern.previousRuns(1, now);
		if (!runAt) continue;
		const key = runKey(s.name, runAt);
		if (await enqueueOnce(db, key, s.type, s.payload)) queued.push(key);
	}
	return queued;
}

export function startScheduler({
	db,
	log,
	schedules = defaultSchedules,
	tickMs = DEFAULT_TICK_MS,
}: SchedulerOptions): Scheduler {
	const parsed = parseSchedules(schedules);

	let ticking: Promise<void> = Promise.resolve();
	const tick = () => {
		ticking = enqueueDueRuns(db, parsed, new Date())
			.then((keys) => {
				for (const key of keys) log.info({ key }, "scheduled job queued");
			})
			// The next tick tries again (database down, most likely).
			.catch((err) => log.error({ err }, "scheduler tick failed"));
	};

	tick();
	const timer = setInterval(tick, tickMs);
	log.info(
		{ schedules: parsed.map((s) => `${s.name} (${s.cron})`), tickMs },
		"scheduler started",
	);

	return {
		async stop() {
			clearInterval(timer);
			await ticking;
		},
	};
}
