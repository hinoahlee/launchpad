import type { Config } from "#config/schema.ts";
import { createS3Driver } from "./s3/driver.ts";
import type { StorageDriver } from "./types.ts";

// No bucket: undefined, and the file routes aren't registered.
export function createStorageDriver(config: Config): StorageDriver | undefined {
	if (!config.S3_BUCKET) return undefined;
	const {
		S3_ACCESS_KEY_ID: accessKeyId,
		S3_SECRET_ACCESS_KEY: secretAccessKey,
	} = config;
	return createS3Driver({
		...(config.S3_ENDPOINT && { endpoint: config.S3_ENDPOINT }),
		region: config.S3_REGION,
		bucket: config.S3_BUCKET,
		...(accessKeyId &&
			secretAccessKey && { credentials: { accessKeyId, secretAccessKey } }),
	});
}
