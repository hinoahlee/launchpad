import {
	DeleteObjectCommand,
	DeleteObjectsCommand,
	GetObjectCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	NotFound,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DOWNLOAD_URL_TTL_MS, UPLOAD_URL_TTL_MS } from "../constants.ts";
import type { StorageDriver } from "../types.ts";
import { attachmentDisposition } from "../utils.ts";

type S3Settings = {
	// Unset: AWS S3.
	endpoint?: string;
	region: string;
	bucket: string;
	// Unset: the SDK's default chain (an AWS instance or task role).
	credentials?: { accessKeyId: string; secretAccessKey: string };
};

const seconds = (ms: number) => Math.floor(ms / 1000);

// Any S3-compatible bucket (R2, AWS S3). Signing URLs is local; only sizeOf and the deletes call the bucket.
export function createS3Driver(settings: S3Settings): StorageDriver {
	const client = new S3Client({
		...(settings.endpoint && { endpoint: settings.endpoint }),
		region: settings.region,
		// <endpoint>/<bucket>/<key>: the origin (for the CSP) is the endpoint's, and a local fake bucket works.
		forcePathStyle: true,
		...(settings.credentials && { credentials: settings.credentials }),
		// Otherwise the SDK signs a checksum of a body a presigned PUT doesn't have yet, and the upload is refused.
		requestChecksumCalculation: "WHEN_REQUIRED",
		responseChecksumValidation: "WHEN_REQUIRED",
	});
	const Bucket = settings.bucket;

	return {
		origin: settings.endpoint
			? new URL(settings.endpoint).origin
			: `https://s3.${settings.region}.amazonaws.com`,

		async presignUpload({ key, contentType, sizeBytes }) {
			const expiresAt = new Date(Date.now() + UPLOAD_URL_TTL_MS);
			const url = await getSignedUrl(
				client,
				new PutObjectCommand({
					Bucket,
					Key: key,
					ContentType: contentType,
					ContentLength: sizeBytes,
				}),
				{
					expiresIn: seconds(UPLOAD_URL_TTL_MS),
					// The bucket refuses a PUT whose type or size differs from what was registered.
					signableHeaders: new Set(["content-type", "content-length"]),
				},
			);
			return { url, headers: { "Content-Type": contentType }, expiresAt };
		},

		async presignDownload({ key, fileName }) {
			const expiresAt = new Date(Date.now() + DOWNLOAD_URL_TTL_MS);
			const url = await getSignedUrl(
				client,
				new GetObjectCommand({
					Bucket,
					Key: key,
					ResponseContentDisposition: attachmentDisposition(fileName),
				}),
				{ expiresIn: seconds(DOWNLOAD_URL_TTL_MS) },
			);
			return { url, expiresAt };
		},

		async sizeOf(key) {
			try {
				const head = await client.send(
					new HeadObjectCommand({ Bucket, Key: key }),
				);
				return head.ContentLength ?? null;
			} catch (err) {
				if (err instanceof NotFound) return null;
				throw err;
			}
		},

		async delete(key) {
			await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
		},

		async deletePrefix(prefix) {
			let deleted = 0;
			let ContinuationToken: string | undefined;
			do {
				const page = await client.send(
					new ListObjectsV2Command({
						Bucket,
						Prefix: prefix,
						ContinuationToken,
					}),
				);
				const keys = (page.Contents ?? []).flatMap((o) =>
					o.Key ? [o.Key] : [],
				);
				if (keys.length > 0) {
					const result = await client.send(
						new DeleteObjectsCommand({
							Bucket,
							Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
						}),
					);
					// A batch delete answers 200 even when some keys failed.
					if (result.Errors?.length) {
						throw new Error(
							`could not delete ${result.Errors.length} objects under ${prefix}: ${result.Errors[0]?.Code}`,
						);
					}
					deleted += keys.length;
				}
				ContinuationToken = page.IsTruncated
					? page.NextContinuationToken
					: undefined;
			} while (ContinuationToken);
			return deleted;
		},
	};
}
