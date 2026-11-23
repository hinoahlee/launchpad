import type { JobType } from "./schemas.ts";
import type { Schedule } from "./types.ts";

// Types the payload against its own job type.
const schedule = <T extends JobType>(s: Schedule<T>): Schedule<T> => s;

export const schedules: Schedule[] = [
	schedule({
		name: "prune-jobs",
		cron: "0 * * * *",
		type: "prune-jobs",
		payload: {},
	}),
	schedule({
		name: "prune-uploads",
		cron: "30 * * * *",
		type: "prune-uploads",
		payload: {},
	}),
];
