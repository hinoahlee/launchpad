import type { Config } from "#config.ts";
import type { StorageDriver } from "./driver.ts";
import { createS3Driver } from "./s3-driver.ts";

// The bucket from config, or undefined when none is set: then the file routes aren't added and uploads are off
// (config.ts requires the bucket and both keys together).
export function createStorageDriver(config: Config): StorageDriver | undefined {
	const {
		S3_BUCKET: bucket,
		S3_ACCESS_KEY_ID: accessKeyId,
		S3_SECRET_ACCESS_KEY: secretAccessKey,
	} = config;
	if (!bucket || !accessKeyId || !secretAccessKey) return undefined;
	return createS3Driver({
		...(config.S3_ENDPOINT && { endpoint: config.S3_ENDPOINT }),
		region: config.S3_REGION,
		bucket,
		accessKeyId,
		secretAccessKey,
	});
}
