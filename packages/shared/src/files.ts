import { z } from "zod";

// Uploads go straight from the browser to the bucket; the API only signs URLs. The flow:
//   POST /api/files                    register: a pending file, and a signed URL to PUT the bytes to
//   PUT  <uploadUrl>                   the browser, to the bucket (not the API), with `uploadHeaders`
//   POST /api/files/:id/complete       the API checks the object's size in the bucket → uploaded
//   GET  /api/files/:id/download       a signed URL that downloads it (as an attachment)

// Larger files would need multipart upload (the bucket takes one PUT up to 5 GB, but a dropped connection then
// restarts from zero). Kept small: the free tier is 10 GB in all.
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const fileSchema = z.object({
	id: z.uuid(),
	fileName: z.string(),
	contentType: z.string(),
	sizeBytes: z.number().int(),
	uploadedAt: z.iso.datetime(),
});

export type FileItem = z.infer<typeof fileSchema>;

// GET /api/files: your uploaded files, newest first. Pending uploads aren't listed.
export const fileListResponseSchema = z.object({ files: z.array(fileSchema) });

export type FileListResponse = z.infer<typeof fileListResponseSchema>;

export const fileParamsSchema = z.object({ id: z.uuid() });

export const createFileBodySchema = z.object({
	fileName: z.string().trim().min(1).max(255),
	// What the browser reports (File.type). It reports "" when it doesn't know: send application/octet-stream.
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
	// Send exactly these with the PUT: the signature covers them, so another value fails with 403.
	uploadHeaders: z.record(z.string(), z.string()),
	expiresAt: z.iso.datetime(),
});

export type CreateFileResponse = z.infer<typeof createFileResponseSchema>;

export const downloadResponseSchema = z.object({
	url: z.url(),
	expiresAt: z.iso.datetime(),
});

export type DownloadResponse = z.infer<typeof downloadResponseSchema>;
