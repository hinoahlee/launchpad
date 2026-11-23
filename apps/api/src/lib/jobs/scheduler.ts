import type { Database } from "@launchpad/db";
import { Cron } from "croner";
import type { Logger } from "pino";
import { enqueueOnce } from "./enqueue.ts";
import { schedules as defaultSchedules } from "./schedules.ts";
import type { Schedule } from "./types.ts";

// Every worker runs a scheduler; they don't coordinate. Each run is queued with a unique key (name + time), so
// exactly one insert wins. Each tick queues only a schedule's latest run: never a backlog of missed ones.

type SchedulerOptions = {
	db: Database;
	log: Logger;
	schedules?: Schedule[];
	tickMs?: number;
};

type Scheduler = { stop: () => Promise<void> };

const DEFAULT_TICK_MS = 30_000;

type Parsed = Schedule & { pattern: Cron };

// Throws on a bad cron expression or a repeated name: a typo stops the worker at boot.
export function parseSchedules(schedules: Schedule[]): Parsed[] {
	const names = new Set<string>();
	return schedules.map((s) => {
		if (names.has(s.name)) throw new Error(`duplicate schedule "${s.name}"`);
		names.add(s.name);
		// No callback: croner only computes times.
		return { ...s, pattern: new Cron(s.cron, { timezone: "UTC" }) };
	});
}

export const runKey = (name: string, runAt: Date) =>
	`${name}:${runAt.toISOString()}`;

// Returns the keys it queued.
export async function enqueueDueRuns(
	db: Database,
	schedules: Parsed[],
	now: Date,
): Promise<string[]> {
	const queued: string[] = [];
	for (const s of schedules) {
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
