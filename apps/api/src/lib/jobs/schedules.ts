import type { JobInput, JobType } from "./job-types.ts";

// A recurring job: queue `type` with `payload` at every time the cron expression matches.
//
// Cron expression: five fields, "minute hour day-of-month month day-of-week", always read in UTC here.
//   "0 * * * *"    every hour, on the hour
//   "*/15 * * * *" every 15 minutes
//   "30 3 * * 1"   Mondays at 03:30
export type Schedule<T extends JobType = JobType> = {
	// Unique and stable: part of each run's key. Renaming a schedule makes it look new, so it runs once more.
	name: string;
	cron: string;
	type: T;
	payload: JobInput<T>;
};

// Checks the payload against its own type (an array literal alone would accept any type's payload).
const schedule = <T extends JobType>(s: Schedule<T>): Schedule<T> => s;

export const schedules: Schedule[] = [
	schedule({
		name: "prune-jobs",
		cron: "0 * * * *",
		type: "prune-jobs",
		payload: {},
	}),
];
