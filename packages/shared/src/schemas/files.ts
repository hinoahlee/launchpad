import { z } from "zod";
import { MAX_FILE_BYTES } from "../constants.ts";
import { organizationParamsSchema } from "./organizations.ts";

// Under /api/organizations/:organizationId. Bytes go browser ↔ bucket; the API only signs URLs:
//   POST /files                    register: a pending file, and a signed URL to PUT the bytes to
//   PUT  <uploadUrl>               the browser, to the bucket (not the API), with `uploadHeaders`
//   POST /files/:id/complete       the API checks the object's size in the bucket → uploaded
//   GET  /files/:id/download       a signed URL that downloads it (as an attachment)
//   DELETE /files/:id              admins and owners only

export const fileSchema = z.object({
	id: z.uuid(),
	fileName: z.string(),
	contentType: z.string(),
	sizeBytes: z.number().int(),
	uploadedAt: z.iso.datetime(),
});

export type FileItem = z.infer<typeof fileSchema>;

// Newest first; pending uploads aren't listed.
export const fileListResponseSchema = z.object({ files: z.array(fileSchema) });

export type FileListResponse = z.infer<typeof fileListResponseSchema>;

export const fileParamsSchema = organizationParamsSchema.extend({
	id: z.uuid(),
});

export const createFileBodySchema = z.object({
	fileName: z.string().trim().min(1).max(255),
	// File.type is "" when the browser doesn't know: send application/octet-stream.
	contentType: z
		.string()
		.max(255)
		.regex(/^[\w.+-]+\/[\w.+-]+$/, "a MIME type, e.g. image/png"),
	sizeBytes: z.number().int().min(1).max(MAX_FILE_BYTES),
});

export type CreateFileBody = z.infer<typeof createFileBodySchema>;

export const createFileResponseSchema = z.object({
	id: z.uuid(),
	uploadUrl: z.url(),
	// Send exactly these with the PUT: the signature covers them.
	uploadHeaders: z.record(z.string(), z.string()),
	expiresAt: z.iso.datetime(),
});

export type CreateFileResponse = z.infer<typeof createFileResponseSchema>;

export const downloadResponseSchema = z.object({
	url: z.url(),
	expiresAt: z.iso.datetime(),
});

export type DownloadResponse = z.infer<typeof downloadResponseSchema>;
