import { files } from "@launchpad/db";
import { and, inArray, isNull, lt } from "drizzle-orm";
import { renderEmail } from "#lib/email/render.tsx";
import { suppressionReason } from "#lib/email/suppression.ts";
import { organizationPrefix } from "#lib/storage/keys.ts";
import { enqueue } from "./enqueue.ts";
import { pruneDoneJobs } from "./queue.ts";
import type { JobHandlers } from "./types.ts";

const PRUNE_BATCH = 500;

const MISSING_STORAGE =
	"no bucket configured on the worker: set the S3_* variables";

export const handlers: JobHandlers = {
	echo: async ({ message }, { log }) => {
		log.info({ message }, "echo");
	},
	// Idempotent through the provider: the job id is its idempotency key.
	send_email: async (message, { jobId, db, email, log, signal }) => {
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
	"prune-jobs": async ({ olderThanDays }, { db, log }) => {
		const deleted = await pruneDoneJobs(db, olderThanDays);
		log.info({ deleted, olderThanDays }, "pruned done jobs");
	},
	"delete-organization-files": async ({ organizationId }, { storage, log }) => {
		if (!storage) throw new Error(MISSING_STORAGE);
		const deleted = await storage.deletePrefix(
			organizationPrefix(organizationId),
		);
		log.info(
			{ organizationId, deleted },
			"deleted a deleted organization's files",
		);
	},
	"delete-file-object": async ({ key }, { storage, log }) => {
		if (!storage) throw new Error(MISSING_STORAGE);
		await storage.delete(key);
		log.info({ key }, "deleted a deleted file's object again");
	},
	// Rows first, each with a job that deletes its object, in one transaction: a late /complete either lands before
	// (the row is no longer abandoned, so it stays) or finds no row. Deleting objects first could leave a completed
	// row whose object is gone.
	"prune-uploads": async ({ olderThanHours }, { db, log }) => {
		const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
		const abandoned = and(
			isNull(files.uploadedAt),
			lt(files.createdAt, cutoff),
		);
		const deleted = await db.transaction(async (tx) => {
			const batch = tx
				.select({ id: files.id })
				.from(files)
				.where(abandoned)
				.limit(PRUNE_BATCH);
			// `abandoned` again: a row completed since the select above stays.
			const rows = await tx
				.delete(files)
				.where(and(inArray(files.id, batch), abandoned))
				.returning({ key: files.storageKey });
			for (const row of rows) {
				await enqueue(tx, "delete-file-object", { key: row.key });
			}
			return rows.length;
		});
		if (deleted === 0) return;
		log.info({ deleted, olderThanHours }, "pruned abandoned uploads");
	},
};
