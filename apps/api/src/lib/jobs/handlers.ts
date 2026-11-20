import type { Database } from "@launchpad/db";
import type { Logger } from "pino";
import type { EmailDriver } from "#lib/email/driver.ts";
import { renderEmail } from "#lib/email/render.tsx";
import { suppressionReason } from "#lib/email/suppression.ts";
import type { JobPayload, JobType } from "./job-types.ts";
import { pruneDoneJobs } from "./queue.ts";

export type JobContext = {
	jobId: string;
	db: Database;
	email: EmailDriver;
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
	// Idempotent through the provider: the job id is the idempotency key, so a retry after a send that went
	// through (but wasn't marked done) is dropped by the provider instead of delivered twice.
	send_email: async (message, { jobId, db, email, log, signal }) => {
		// Never email an address that hard-bounced or complained (recorded by the Resend webhook). The job still
		// ends as done: retrying wouldn't change the answer.
		const suppressed = await suppressionReason(db, message.to);
		if (suppressed) {
			log.info(
				{ template: message.template, reason: suppressed },
				"email skipped: address suppressed",
			);
			return;
		}
		const rendered = await renderEmail(message);
		const { providerId } = await email.send(
			{ to: message.to, ...rendered, idempotencyKey: jobId },
			signal,
		);
		log.info({ template: message.template, providerId }, "email sent");
	},
	// Idempotent as it is: a second run finds nothing left to delete.
	"prune-jobs": async ({ olderThanDays }, { db, log }) => {
		const deleted = await pruneDoneJobs(db, olderThanDays);
		log.info({ deleted, olderThanDays }, "pruned done jobs");
	},
};
