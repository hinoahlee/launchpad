// The one interface the API reaches the bucket through (like lib/email's EmailDriver): routes depend on this,
// never on the S3 SDK. The S3 adapter talks to R2 or AWS S3; tests use the in-memory one.

// Long enough to upload 25 MB on a slow connection; short enough that a leaked URL soon stops working.
export const UPLOAD_URL_TTL_MS = 15 * 60 * 1000;
// A download URL is used right away (the browser follows it), so it can be short.
export const DOWNLOAD_URL_TTL_MS = 5 * 60 * 1000;

export type PresignedUpload = {
	url: string;
	// Headers the browser must send with the PUT, exactly: the signature covers them.
	headers: Record<string, string>;
	expiresAt: Date;
};

export type PresignedDownload = { url: string; expiresAt: Date };

export type StorageDriver = {
	// A URL that accepts one PUT of exactly `sizeBytes` bytes of `contentType` to `key`, until it expires.
	presignUpload(input: {
		key: string;
		contentType: string;
		sizeBytes: number;
	}): Promise<PresignedUpload>;
	// A URL that downloads `key`, saved as `fileName` (Content-Disposition: attachment).
	presignDownload(input: {
		key: string;
		fileName: string;
	}): Promise<PresignedDownload>;
	// The object's size in bytes, or null if there's no object at `key`. A real request to the bucket.
	sizeOf(key: string): Promise<number | null>;
	// Removes the object; no error if it was already gone.
	delete(key: string): Promise<void>;
};

// users/<userId>/<random uuid>: the prefix groups one person's objects (deleting an account removes the prefix,
// step 11.4). The random part means a key never reuses the person's file name, which may hold anything.
export function storageKey(userId: string): string {
	return `users/${userId}/${crypto.randomUUID()}`;
}

// Content-Disposition: attachment makes the browser save the file instead of showing it. That matters for
// safety: an uploaded HTML or SVG file opened in the page could run its scripts. The name goes twice (RFC 6266):
// a plain-ASCII fallback for old clients, and the exact name UTF-8 encoded (`filename*`).
export function attachmentDisposition(fileName: string): string {
	const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
	const encoded = encodeURIComponent(fileName).replace(
		/['()*]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
	);
	return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
