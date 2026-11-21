import {
	DOWNLOAD_URL_TTL_MS,
	type StorageDriver,
	UPLOAD_URL_TTL_MS,
} from "./driver.ts";

// Stands in for the bucket in tests: object sizes by key. Its URLs point nowhere; a test "uploads" with `put`,
// since the PUT itself is between the browser and the bucket, not the API.
export const MEMORY_STORAGE_ORIGIN = "https://bucket.storage.test";

export type MemoryStorageDriver = StorageDriver & {
	objects: Map<string, number>;
	// What the browser's PUT to an upload URL would leave in the bucket.
	put(uploadUrl: string, sizeBytes: number): void;
};

const keyOf = (url: string) =>
	decodeURIComponent(new URL(url).pathname.slice(1));

export function createMemoryStorageDriver(): MemoryStorageDriver {
	const objects = new Map<string, number>();
	return {
		origin: MEMORY_STORAGE_ORIGIN,
		objects,
		put(uploadUrl, sizeBytes) {
			objects.set(keyOf(uploadUrl), sizeBytes);
		},
		async presignUpload({ key, contentType }) {
			return {
				url: `${MEMORY_STORAGE_ORIGIN}/${key}?op=put`,
				headers: { "Content-Type": contentType },
				expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_MS),
			};
		},
		async presignDownload({ key, fileName }) {
			const url = new URL(`${MEMORY_STORAGE_ORIGIN}/${key}`);
			url.searchParams.set("download", fileName);
			return {
				url: url.toString(),
				expiresAt: new Date(Date.now() + DOWNLOAD_URL_TTL_MS),
			};
		},
		async sizeOf(key) {
			return objects.get(key) ?? null;
		},
		async delete(key) {
			objects.delete(key);
		},
		async deletePrefix(prefix) {
			const keys = [...objects.keys()].filter((key) => key.startsWith(prefix));
			for (const key of keys) objects.delete(key);
			return keys.length;
		},
	};
}
