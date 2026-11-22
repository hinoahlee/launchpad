import {
	createFileResponseSchema,
	downloadResponseSchema,
	fileListResponseSchema,
	fileSchema,
	MAX_FILE_BYTES,
} from "@launchpad/shared";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { ApiError, api } from "#lib/api.ts";

// Files belong to an organization (12.2): every path starts with it.
const filesPath = (organizationId: string) =>
	`/organizations/${organizationId}/files` as const;

// The organization's uploaded files, or null when uploads are off: a server without a bucket has no file routes,
// so the API answers 404.
export const filesQuery = (organizationId: string) =>
	queryOptions({
		queryKey: ["account", "files", organizationId],
		queryFn: async ({ signal }) => {
			try {
				return await api(filesPath(organizationId), fileListResponseSchema, {
					signal,
				});
			} catch (error) {
				if (error instanceof ApiError && error.status === 404) return null;
				throw error;
			}
		},
	});

// Why an upload didn't happen, for the page to show. API refusals arrive as ApiError instead.
export class UploadError extends Error {
	readonly reason: "too_large" | "bucket_refused";

	constructor(reason: "too_large" | "bucket_refused") {
		super(`upload failed: ${reason}`);
		this.reason = reason;
		this.name = "UploadError";
	}
}

// The whole upload, in three requests: register with the API, PUT the bytes straight to the bucket, then ask
// the API to check the bucket and mark the file uploaded.
export async function uploadFile(organizationId: string, file: File) {
	// The API refuses it too; checking here saves the round trip and gives a clearer message.
	if (file.size > MAX_FILE_BYTES) throw new UploadError("too_large");

	const target = await api(
		filesPath(organizationId),
		createFileResponseSchema,
		{
			method: "POST",
			json: {
				fileName: file.name,
				// The browser reports "" when it doesn't know the type.
				contentType: file.type || "application/octet-stream",
				sizeBytes: file.size,
			},
		},
	);

	// Not through `api()`: this goes to the bucket, not /api. The body is the File itself, which the browser
	// streams from disk; it sets Content-Length from the file. A signed URL needs no cookie, so none is sent.
	const put = await fetch(target.uploadUrl, {
		method: "PUT",
		headers: target.uploadHeaders,
		body: file,
		credentials: "omit",
	});
	if (!put.ok) throw new UploadError("bucket_refused");

	return api(`${filesPath(organizationId)}/${target.id}/complete`, fileSchema, {
		method: "POST",
	});
}

// A short-lived URL; the caller navigates to it and the bucket answers with the file as an attachment.
export const downloadUrl = (organizationId: string, id: string) =>
	api(`${filesPath(organizationId)}/${id}/download`, downloadResponseSchema);

export const deleteFile = (organizationId: string, id: string) =>
	api(`${filesPath(organizationId)}/${id}`, z.undefined(), {
		method: "DELETE",
	});
