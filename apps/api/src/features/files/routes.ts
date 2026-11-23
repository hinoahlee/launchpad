import { type FileRow, files, organizations } from "@launchpad/db";
import {
	createFileBodySchema,
	createFileResponseSchema,
	downloadResponseSchema,
	errorResponseSchema,
	type FileItem,
	fileListResponseSchema,
	fileParamsSchema,
	fileSchema,
	organizationParamsSchema,
} from "@launchpad/shared";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
	membershipOf,
	requireMembership,
} from "#features/auth/require-membership.ts";
import { requireSession, sessionOf } from "#features/auth/require-session.ts";
import { entitlementsOf } from "#lib/entitlements.ts";
import { enqueue } from "#lib/jobs/enqueue.ts";
import {
	AFTER_UPLOAD_URLS_EXPIRE_MS,
	type StorageDriver,
	storageKey,
} from "#lib/storage/driver.ts";

function toFileItem(row: FileRow, uploadedAt: Date): FileItem {
	return {
		id: row.id,
		fileName: row.fileName,
		contentType: row.contentType,
		sizeBytes: row.sizeBytes,
		uploadedAt: uploadedAt.toISOString(),
	};
}

// /api/organizations/:organizationId/files: an organization's files. The bytes never pass through the API: it signs a URL, the browser
// uploads straight to the bucket, then `complete` checks the bucket before the file counts as uploaded.
// Tenant isolation (decision 011): every route runs requireMembership (not a member: 404), and every query filters
// on that membership's organization: another organization's file is a 404, as if it didn't exist.
export const fileRoutes =
	(storage: StorageDriver): FastifyPluginAsyncZod =>
	async (app) => {
		app.addHook("onRequest", requireSession);
		// Per route, not for the whole plugin, because the role differs: any member reads and uploads, deleting
		// needs an admin. A route that forgets it fails with a 500 at membershipOf(), never runs open.
		const member = requireMembership("member");
		const admin = requireMembership("admin");

		app.get(
			"/files",
			{
				preHandler: member,
				schema: {
					params: organizationParamsSchema,
					response: { 200: fileListResponseSchema },
				},
			},
			async (request) => {
				const { organizationId } = membershipOf(request);
				const rows = await app.db
					.select()
					.from(files)
					.where(
						and(
							eq(files.organizationId, organizationId),
							isNotNull(files.uploadedAt),
						),
					)
					.orderBy(desc(files.uploadedAt), desc(files.id));
				return {
					files: rows.flatMap((row) =>
						row.uploadedAt ? [toFileItem(row, row.uploadedAt)] : [],
					),
				};
			},
		);

		// Register: a pending row, and a signed URL to PUT the bytes to.
		app.post(
			"/files",
			{
				preHandler: member,
				schema: {
					params: organizationParamsSchema,
					body: createFileBodySchema,
					response: { 201: createFileResponseSchema, 413: errorResponseSchema },
				},
			},
			async (request, reply) => {
				const { user } = sessionOf(request);
				const { organizationId } = membershipOf(request);
				const { fileName, contentType, sizeBytes } = request.body;
				const key = storageKey(organizationId);
				const row = await app.db.transaction(async (tx) => {
					// Lock the organization's row until the insert commits, so two uploads at once (by anyone in it)
					// can't both see room for one.
					await tx
						.select({ id: organizations.id })
						.from(organizations)
						.where(eq(organizations.id, organizationId))
						.for("update");
					// Pending rows count: their bytes may already be in the bucket, completed or not.
					const [usage] = await tx
						.select({
							used: sql<string>`coalesce(sum(${files.sizeBytes}), 0)::bigint`,
						})
						.from(files)
						.where(eq(files.organizationId, organizationId));
					// The gate (13.4): the plan decides the quota. Read in this transaction, after the lock.
					const { storageQuotaBytes } = await entitlementsOf(
						tx,
						organizationId,
					);
					if (Number(usage?.used ?? 0) + sizeBytes > storageQuotaBytes) {
						return null;
					}
					const [inserted] = await tx
						.insert(files)
						.values({
							organizationId,
							userId: user.id,
							fileName,
							contentType,
							sizeBytes,
							storageKey: key,
						})
						.returning({ id: files.id });
					if (!inserted) throw new Error("files insert returned no row");
					return inserted;
				});
				if (!row) {
					reply.code(413);
					return { error: "storage_quota_exceeded" };
				}
				const upload = await storage.presignUpload({
					key,
					contentType,
					sizeBytes,
				});
				reply.code(201);
				return {
					id: row.id,
					uploadUrl: upload.url,
					uploadHeaders: upload.headers,
					expiresAt: upload.expiresAt.toISOString(),
				};
			},
		);

		// The browser says "uploaded"; the bucket has the final word. Asking it (not trusting the browser) keeps the
		// table true to what's stored: no row marked uploaded without its object.
		app.post(
			"/files/:id/complete",
			{
				preHandler: member,
				schema: {
					params: fileParamsSchema,
					response: {
						200: fileSchema,
						400: errorResponseSchema,
						404: errorResponseSchema,
						409: errorResponseSchema,
					},
				},
			},
			async (request, reply) => {
				const { organizationId } = membershipOf(request);
				const owned = and(
					eq(files.id, request.params.id),
					eq(files.organizationId, organizationId),
				);
				const [file] = await app.db.select().from(files).where(owned);
				if (!file) {
					reply.code(404);
					return { error: "not_found" };
				}
				// Calling it twice is fine: the second call returns the same file.
				if (file.uploadedAt) return toFileItem(file, file.uploadedAt);

				const size = await storage.sizeOf(file.storageKey);
				// Nothing there yet: keep the row, so the browser can finish (or retry) the PUT and call again.
				if (size === null) {
					reply.code(409);
					return { error: "upload_incomplete" };
				}
				// The signed URL pins the size, so this means a bug or a bucket that ignores it: drop both.
				if (size !== file.sizeBytes) {
					await app.db.delete(files).where(owned);
					await storage.delete(file.storageKey);
					reply.code(400);
					return { error: "upload_size_mismatch" };
				}

				const [uploaded] = await app.db
					.update(files)
					.set({ uploadedAt: new Date() })
					.where(owned)
					.returning();
				// Deleted between the select and here (a delete request racing this one).
				if (!uploaded?.uploadedAt) {
					reply.code(404);
					return { error: "not_found" };
				}
				return toFileItem(uploaded, uploaded.uploadedAt);
			},
		);

		// A short-lived URL to the object; the browser follows it and the bucket serves the bytes.
		app.get(
			"/files/:id/download",
			{
				preHandler: member,
				schema: {
					params: fileParamsSchema,
					response: { 200: downloadResponseSchema, 404: errorResponseSchema },
				},
			},
			async (request, reply) => {
				const { organizationId } = membershipOf(request);
				const [file] = await app.db
					.select()
					.from(files)
					.where(
						and(
							eq(files.id, request.params.id),
							eq(files.organizationId, organizationId),
							isNotNull(files.uploadedAt),
						),
					);
				if (!file) {
					reply.code(404);
					return { error: "not_found" };
				}
				const download = await storage.presignDownload({
					key: file.storageKey,
					fileName: file.fileName,
				});
				return {
					url: download.url,
					expiresAt: download.expiresAt.toISOString(),
				};
			},
		);

		app.delete(
			"/files/:id",
			{
				preHandler: admin,
				schema: {
					params: fileParamsSchema,
					response: {
						204: z.null(),
						403: errorResponseSchema,
						404: errorResponseSchema,
					},
				},
			},
			async (request, reply) => {
				const { organizationId } = membershipOf(request);
				const removed = await app.db.transaction(async (tx) => {
					const [row] = await tx
						.delete(files)
						.where(
							and(
								eq(files.id, request.params.id),
								eq(files.organizationId, organizationId),
							),
						)
						.returning({ key: files.storageKey });
					// A second delete once its upload URL has expired (security review L2): a PUT through it would bring
					// the object back with no row. Queued with the row's delete: both happen, or neither.
					if (row) {
						await enqueue(
							tx,
							"delete-file-object",
							{ key: row.key },
							{ runAfter: new Date(Date.now() + AFTER_UPLOAD_URLS_EXPIRE_MS) },
						);
					}
					return row;
				});
				if (!removed) {
					reply.code(404);
					return { error: "not_found" };
				}
				// The row is gone, so the file is gone for the user. If the bucket call fails, the object is
				// orphaned (stored, but nothing points at it): log it rather than fail a delete that already happened.
				try {
					await storage.delete(removed.key);
				} catch (err) {
					request.log.error(
						{ err, key: removed.key },
						"storage delete failed; object orphaned",
					);
				}
				reply.code(204);
				return null;
			},
		);
	};
