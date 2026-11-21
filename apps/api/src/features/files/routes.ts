import { type FileRow, files } from "@launchpad/db";
import {
	createFileBodySchema,
	createFileResponseSchema,
	downloadResponseSchema,
	errorResponseSchema,
	type FileItem,
	fileListResponseSchema,
	fileParamsSchema,
	fileSchema,
} from "@launchpad/shared";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireSession, sessionOf } from "#features/auth/require-session.ts";
import { type StorageDriver, storageKey } from "#lib/storage/driver.ts";

function toFileItem(row: FileRow, uploadedAt: Date): FileItem {
	return {
		id: row.id,
		fileName: row.fileName,
		contentType: row.contentType,
		sizeBytes: row.sizeBytes,
		uploadedAt: uploadedAt.toISOString(),
	};
}

// /api/files: the signed-in user's files. The bytes never pass through the API: it signs a URL, the browser
// uploads straight to the bucket, then `complete` checks the bucket before the file counts as uploaded. Like
// features/account, every query filters on the user's id: another user's file is a 404, as if it didn't exist.
export const fileRoutes =
	(storage: StorageDriver): FastifyPluginAsyncZod =>
	async (app) => {
		app.addHook("onRequest", requireSession);

		app.get(
			"/files",
			{ schema: { response: { 200: fileListResponseSchema } } },
			async (request) => {
				const { user } = sessionOf(request);
				const rows = await app.db
					.select()
					.from(files)
					.where(and(eq(files.userId, user.id), isNotNull(files.uploadedAt)))
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
				schema: {
					body: createFileBodySchema,
					response: { 201: createFileResponseSchema },
				},
			},
			async (request, reply) => {
				const { user } = sessionOf(request);
				const { fileName, contentType, sizeBytes } = request.body;
				const key = storageKey(user.id);
				const [row] = await app.db
					.insert(files)
					.values({
						userId: user.id,
						fileName,
						contentType,
						sizeBytes,
						storageKey: key,
					})
					.returning({ id: files.id });
				if (!row) throw new Error("files insert returned no row");
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
				const { user } = sessionOf(request);
				const owned = and(
					eq(files.id, request.params.id),
					eq(files.userId, user.id),
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
				schema: {
					params: fileParamsSchema,
					response: { 200: downloadResponseSchema, 404: errorResponseSchema },
				},
			},
			async (request, reply) => {
				const { user } = sessionOf(request);
				const [file] = await app.db
					.select()
					.from(files)
					.where(
						and(
							eq(files.id, request.params.id),
							eq(files.userId, user.id),
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
				schema: {
					params: fileParamsSchema,
					response: { 204: z.null(), 404: errorResponseSchema },
				},
			},
			async (request, reply) => {
				const { user } = sessionOf(request);
				const [removed] = await app.db
					.delete(files)
					.where(
						and(eq(files.id, request.params.id), eq(files.userId, user.id)),
					)
					.returning({ key: files.storageKey });
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
