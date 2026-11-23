import {
	createFileResponseSchema,
	downloadResponseSchema,
	fileListResponseSchema,
	fileSchema,
	MAX_FILE_BYTES,
} from "@launchpad/shared";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "#lib/api/client.ts";
import { ApiError } from "#lib/api/errors.ts";
import { UploadError } from "./errors.ts";

const filesPath = (organizationId: string) =>
	`/organizations/${organizationId}/files` as const;

// null when uploads are off (no bucket: the file routes 404).
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

// Register with the API, PUT the bytes straight to the bucket, then have the API check the bucket.
export async function uploadFile(organizationId: string, file: File) {
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

	// To the bucket, not /api: no `api()`, and no cookie (the URL is signed).
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

export const downloadUrl = (organizationId: string, id: string) =>
	api(`${filesPath(organizationId)}/${id}/download`, downloadResponseSchema);

export const deleteFile = (organizationId: string, id: string) =>
	api(`${filesPath(organizationId)}/${id}`, z.undefined(), {
		method: "DELETE",
	});
