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
import {
	attachmentDisposition,
	DOWNLOAD_URL_TTL_MS,
	type StorageDriver,
	UPLOAD_URL_TTL_MS,
} from "./driver.ts";

export type S3Settings = {
	// Unset: AWS S3 (the SDK builds the address from the region).
	endpoint?: string;
	region: string;
	bucket: string;
	accessKeyId: string;
	secretAccessKey: string;
};

const seconds = (ms: number) => Math.floor(ms / 1000);

// Any S3-compatible bucket (R2, AWS S3). Signing a URL is local math with the secret key: no request leaves the
// API. Only sizeOf and delete call the bucket.
export function createS3Driver(settings: S3Settings): StorageDriver {
	const client = new S3Client({
		...(settings.endpoint && { endpoint: settings.endpoint }),
		region: settings.region,
		// Path-style URLs: https://<endpoint>/<bucket>/<key>, rather than https://<bucket>.<endpoint>/<key>. The
		// origin is then the endpoint's, known without the SDK, and a local fake bucket (E2E) works on 127.0.0.1.
		// R2 and AWS S3 both accept it.
		forcePathStyle: true,
		credentials: {
			accessKeyId: settings.accessKeyId,
			secretAccessKey: settings.secretAccessKey,
		},
		// The SDK would otherwise sign a checksum of the request body. A presigned PUT has no body yet (the
		// browser sends it later), so the real file would never match and the bucket would reject it.
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
					// Put both in the signature: the bucket rejects a PUT whose type or size differs from what was
					// registered. The browser sets Content-Length itself from the file (scripts can't set it).
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
					// The bucket answers with this header (part of the signed URL, so it can't be changed).
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

		// A page of up to 1,000 keys at a time (the S3 limit for both calls), deleted in one request per page.
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
					// A batch delete answers 200 even when some keys failed; they're listed in Errors.
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
