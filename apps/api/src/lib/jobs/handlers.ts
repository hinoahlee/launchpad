import type { Database } from "@launchpad/db";
import { files } from "@launchpad/db";
import { and, inArray, isNull, lt } from "drizzle-orm";
import type { Logger } from "pino";
import type { EmailDriver } from "#lib/email/driver.ts";
import { renderEmail } from "#lib/email/render.tsx";
import { suppressionReason } from "#lib/email/suppression.ts";
import {
	organizationPrefix,
	type StorageDriver,
	userPrefix,
} from "#lib/storage/driver.ts";
import type { JobPayload, JobType } from "./job-types.ts";
import { pruneDoneJobs } from "./queue.ts";

export type JobContext = {
	jobId: string;
	db: Database;
	email: EmailDriver;
	// The bucket; undefined when the worker has no S3_* settings.
	storage: StorageDriver | undefined;
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
	// Idempotent: deleting a prefix that's already empty deletes nothing.
	"delete-organization-files": async ({ organizationId }, { storage, log }) => {
		if (!storage) throw new Error(missingStorage);
		const deleted = await storage.deletePrefix(
			organizationPrefix(organizationId),
		);
		log.info(
			{ organizationId, deleted },
			"deleted a deleted organization's files",
		);
	},
	// Idempotent: deleting a prefix that's already empty deletes nothing.
	"delete-user-files": async ({ userId }, { storage, log }) => {
		if (!storage) throw new Error(missingStorage);
		const deleted = await storage.deletePrefix(userPrefix(userId));
		log.info({ userId, deleted }, "deleted a deleted account's files");
	},
	// Objects first, then rows: if it stops halfway, the rows are still there and the next run finishes. Deleting
	// an object that's already gone is not an error.
	"prune-uploads": async ({ olderThanHours }, { db, storage, log }) => {
		const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
		const abandoned = and(
			isNull(files.uploadedAt),
			lt(files.createdAt, cutoff),
		);
		const rows = await db
			.select({ id: files.id, key: files.storageKey })
			.from(files)
			.where(abandoned)
			.limit(PRUNE_BATCH);
		if (rows.length === 0) return;
		if (!storage) throw new Error(missingStorage);
		for (const row of rows) await storage.delete(row.key);
		// `abandoned` again: a row completed in the meantime is kept (its object is gone, so its download fails;
		// only possible for an upload completed more than olderThanHours after it started).
		await db.delete(files).where(
			and(
				inArray(
					files.id,
					rows.map((row) => row.id),
				),
				abandoned,
			),
		);
		log.info(
			{ deleted: rows.length, olderThanHours },
			"pruned abandoned uploads",
		);
	},
};

const missingStorage =
	"no bucket configured on the worker: set the S3_* variables (docs/runbooks/r2-bucket.md)";

// Per run. Abandoned uploads are rare; a backlog clears over a few hourly runs.
const PRUNE_BATCH = 500;
