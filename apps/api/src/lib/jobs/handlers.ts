import type { Database } from "@launchpad/db";
import type { Logger } from "pino";
import type { JobPayload, JobType } from "./job-types.ts";

export type JobContext = {
	db: Database;
	// Already tagged with jobId, jobType and attempt.
	log: Logger;
	// Aborted when the worker shuts down or the job's lease runs out. Pass it to fetch() and other slow calls,
	// so the handler stops instead of running on after another worker took the job over.
	signal: AbortSignal;
};

export type JobHandler<T extends JobType> = (
	payload: JobPayload<T>,
	ctx: JobContext,
) => Promise<void>;

// One handler per job type: the compiler fails if a type in job-types.ts has none.
//
// Delivery is at-least-once: a handler can run again for the same job (its worker crashed after doing the
// work but before marking it done). Make every handler idempotent: running it twice has the same effect as
// once, e.g. check "already sent?" before sending, or use the job id as the provider's idempotency key.
export type JobHandlers = { [T in JobType]: JobHandler<T> };

export const handlers: JobHandlers = {
	echo: async ({ message }, { log }) => {
		log.info({ message }, "echo");
	},
};
