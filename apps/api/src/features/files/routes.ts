import { files } from "@launchpad/db";
import {
	createFileBodySchema,
	createFileResponseSchema,
	downloadResponseSchema,
	errorResponseSchema,
	fileListResponseSchema,
	fileParamsSchema,
	fileSchema,
	organizationParamsSchema,
} from "@launchpad/shared";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
	membershipOf,
	requireMembership,
} from "#lib/auth/guards/require-membership.ts";
import { requireSession, sessionOf } from "#lib/auth/guards/require-session.ts";
import type { StorageDriver } from "#lib/storage/driver/types.ts";
import { storageKey } from "#lib/storage/keys.ts";
import { deleteFileRow, insertPendingFile, toFileItem } from "./service.ts";

// Bytes never pass through the API: it signs URLs, the browser talks to the bucket, and `complete` asks the
// bucket before a file counts as uploaded.
export const fileRoutes =
	(storage: StorageDriver): FastifyPluginAsyncZod =>
	async (app) => {
		app.addHook("onRequest", requireSession);
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
				const key = storageKey(organizationId);
				const row = await insertPendingFile(app.db, {
					organizationId,
					userId: user.id,
					storageKey: key,
					file: request.body,
				});
				if (!row) {
					reply.code(413);
					return { error: "storage_quota_exceeded" };
				}
				const upload = await storage.presignUpload({
					key,
					contentType: request.body.contentType,
					sizeBytes: request.body.sizeBytes,
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

		// Idempotent: a second call returns the same file.
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
				if (file.uploadedAt) return toFileItem(file, file.uploadedAt);

				const size = await storage.sizeOf(file.storageKey);
				// Kept, so the browser can retry the PUT and call again.
				if (size === null) {
					reply.code(409);
					return { error: "upload_incomplete" };
				}
				// The signed URL pins the size, so this is a bug or a bucket that ignores it.
				// Deleted like DELETE /files/:id: the upload URL still works for a while, and a PUT through it
				// would bring back an object with no row, so a second delete is queued for after it expires.
				if (size !== file.sizeBytes) {
					await deleteFileRow(app.db, {
						organizationId,
						fileId: file.id,
					});
					await storage.delete(file.storageKey);
					reply.code(400);
					return { error: "upload_size_mismatch" };
				}

				const [uploaded] = await app.db
					.update(files)
					.set({ uploadedAt: new Date() })
					.where(owned)
					.returning();
				// A concurrent delete won.
				if (!uploaded?.uploadedAt) {
					reply.code(404);
					return { error: "not_found" };
				}
				return toFileItem(uploaded, uploaded.uploadedAt);
			},
		);

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
				const key = await deleteFileRow(app.db, {
					organizationId,
					fileId: request.params.id,
				});
				if (!key) {
					reply.code(404);
					return { error: "not_found" };
				}
				// The row is gone, so the file is gone for the user: a failed object delete is logged, not returned.
				try {
					await storage.delete(key);
				} catch (err) {
					request.log.error(
						{ err, key },
						"storage delete failed; object orphaned",
					);
				}
				reply.code(204);
				return null;
			},
		);
	};
