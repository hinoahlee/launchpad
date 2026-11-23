import { files } from "@launchpad/db";
import { and, inArray, isNull, lt } from "drizzle-orm";
import { renderEmail } from "#lib/email/render.tsx";
import { suppressionReason } from "#lib/email/suppression.ts";
import { organizationPrefix } from "#lib/storage/keys.ts";
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
	// Objects first, then rows: if it stops halfway, the next run finishes.
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
		if (!storage) throw new Error(MISSING_STORAGE);
		for (const row of rows) await storage.delete(row.key);
		// `abandoned` again: keeps a row completed in the meantime.
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
