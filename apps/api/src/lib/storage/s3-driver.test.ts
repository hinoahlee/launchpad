import { describe, expect, it } from "vitest";
import { attachmentDisposition } from "./driver.ts";
import { createS3Driver } from "./s3-driver.ts";

// Signing is local, so these run with made-up keys and no network.
const driver = createS3Driver({
	endpoint: "https://account123.r2.cloudflarestorage.com",
	region: "auto",
	bucket: "launchpad-test",
	accessKeyId: "test-key",
	secretAccessKey: "test-secret",
});

describe("S3 driver: presigned URLs", () => {
	it("upload URL: signs the type and size, and no body checksum", async () => {
		const { url, headers } = await driver.presignUpload({
			key: "users/u1/f1",
			contentType: "image/png",
			sizeBytes: 1234,
		});
		const params = new URL(url).searchParams;
		expect(params.get("X-Amz-SignedHeaders")?.split(";")).toEqual(
			expect.arrayContaining(["content-length", "content-type", "host"]),
		);
		expect(params.get("X-Amz-Expires")).toBe("900");
		// A checksum of the empty body the SDK was given would make the bucket reject the real file.
		expect(url).not.toMatch(/checksum/i);
		expect(headers).toEqual({ "Content-Type": "image/png" });
	});

	it("download URL: asks the bucket to answer as an attachment", async () => {
		const { url } = await driver.presignDownload({
			key: "users/u1/f1",
			fileName: "photo.png",
		});
		const params = new URL(url).searchParams;
		expect(params.get("response-content-disposition")).toBe(
			attachmentDisposition("photo.png"),
		);
		expect(params.get("X-Amz-Expires")).toBe("300");
	});
});

describe("attachmentDisposition", () => {
	it("keeps a plain name as is", () => {
		expect(attachmentDisposition("notes.txt")).toBe(
			`attachment; filename="notes.txt"; filename*=UTF-8''notes.txt`,
		);
	});

	// A quote or backslash in the name would end the quoted value early, letting a name add its own parameters.
	it("replaces quotes, backslashes and non-ASCII in the fallback; encodes the exact name", () => {
		expect(attachmentDisposition('a"b\\c é.txt')).toBe(
			`attachment; filename="a_b_c _.txt"; filename*=UTF-8''a%22b%5Cc%20%C3%A9.txt`,
		);
	});
});
