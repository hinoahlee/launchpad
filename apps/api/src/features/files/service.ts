import {
	type Database,
	type FileRow,
	files,
	organizations,
} from "@launchpad/db";
import type { CreateFileBody, FileItem } from "@launchpad/shared";
import { and, eq, sql } from "drizzle-orm";
import { entitlementsOf } from "#lib/entitlements.ts";
import { enqueue } from "#lib/jobs/enqueue.ts";
import { AFTER_UPLOAD_URLS_EXPIRE_MS } from "#lib/storage/driver/constants.ts";

export function toFileItem(row: FileRow, uploadedAt: Date): FileItem {
	return {
		id: row.id,
		fileName: row.fileName,
		contentType: row.contentType,
		sizeBytes: row.sizeBytes,
		uploadedAt: uploadedAt.toISOString(),
	};
}

// Inserts a pending file row if the organization's plan has room for it; null when over quota.
export async function insertPendingFile(
	db: Database,
	{
		organizationId,
		userId,
		storageKey,
		file,
	}: {
		organizationId: string;
		userId: string;
		storageKey: string;
		file: CreateFileBody;
	},
): Promise<{ id: string } | null> {
	return db.transaction(async (tx) => {
		// Locks the organization until commit, so two uploads at once can't both see room for one.
		await tx
			.select({ id: organizations.id })
			.from(organizations)
			.where(eq(organizations.id, organizationId))
			.for("update");
		// Pending rows count: their bytes may already be in the bucket.
		const [usage] = await tx
			.select({
				used: sql<string>`coalesce(sum(${files.sizeBytes}), 0)::bigint`,
			})
			.from(files)
			.where(eq(files.organizationId, organizationId));
		const { storageQuotaBytes } = await entitlementsOf(tx, organizationId);
		if (Number(usage?.used ?? 0) + file.sizeBytes > storageQuotaBytes) {
			return null;
		}
		const [inserted] = await tx
			.insert(files)
			.values({ organizationId, userId, ...file, storageKey })
			.returning({ id: files.id });
		if (!inserted) throw new Error("files insert returned no row");
		return inserted;
	});
}

// Deletes the row and queues a second object delete for after every upload URL has expired (a PUT through one
// would bring the object back with no row). Returns the object's key, or null if no such file.
export async function deleteFileRow(
	db: Database,
	{ organizationId, fileId }: { organizationId: string; fileId: string },
): Promise<string | null> {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.delete(files)
			.where(
				and(eq(files.id, fileId), eq(files.organizationId, organizationId)),
			)
			.returning({ key: files.storageKey });
		if (!row) return null;
		await enqueue(
			tx,
			"delete-file-object",
			{ key: row.key },
			{ runAfter: new Date(Date.now() + AFTER_UPLOAD_URLS_EXPIRE_MS) },
		);
		return row.key;
	});
}
