import { files } from "@launchpad/db";
import { testDatabaseUrl } from "@launchpad/db/testing";
import {
	type CreateFileBody,
	createFileResponseSchema,
	downloadResponseSchema,
	errorResponseSchema,
	fileListResponseSchema,
	fileSchema,
	MAX_FILE_BYTES,
} from "@launchpad/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "#app.ts";
import { createMemoryStorageDriver } from "#lib/storage/memory-driver.ts";
import { testConfig } from "#testing/config.ts";
import { signInWithCode } from "#testing/sign-in.ts";

const APP_URL = "https://app.example.test";
const storage = createMemoryStorageDriver();
const app = buildApp(testConfig({ DATABASE_URL: testDatabaseUrl(), APP_URL }), {
	storage,
});
afterAll(async () => {
	await app.close();
});
// Tables are emptied before each test (testing/setup.ts); empty the bucket with them.
beforeEach(() => {
	storage.objects.clear();
});

const signIn = (email: string) =>
	signInWithCode(app, { email, origin: APP_URL });

const notes: CreateFileBody = {
	fileName: "notes.txt",
	contentType: "text/plain",
	sizeBytes: 11,
};

const register = (cookie: string | undefined, body: object = notes) =>
	app.inject({
		method: "POST",
		url: "/api/files",
		payload: body,
		...(cookie && { headers: { cookie } }),
	});
const complete = (id: string, cookie?: string) =>
	app.inject({
		method: "POST",
		url: `/api/files/${id}/complete`,
		...(cookie && { headers: { cookie } }),
	});
const download = (id: string, cookie?: string) =>
	app.inject({
		method: "GET",
		url: `/api/files/${id}/download`,
		...(cookie && { headers: { cookie } }),
	});
const remove = (id: string, cookie?: string) =>
	app.inject({
		method: "DELETE",
		url: `/api/files/${id}`,
		...(cookie && { headers: { cookie } }),
	});
const list = async (cookie: string) =>
	fileListResponseSchema.parse(
		(
			await app.inject({
				method: "GET",
				url: "/api/files",
				headers: { cookie },
			})
		).json(),
	).files;

// Register → the browser's PUT (here: straight into the memory bucket) → complete.
async function upload(cookie: string, body: CreateFileBody = notes) {
	const target = createFileResponseSchema.parse(
		(await register(cookie, body)).json(),
	);
	storage.put(target.uploadUrl, body.sizeBytes);
	const res = await complete(target.id, cookie);
	expect(res.statusCode).toBe(200);
	return fileSchema.parse(res.json());
}

const someId = "00000000-0000-4000-8000-000000000000";

describe("without a session", () => {
	it("401 on every file route", async () => {
		for (const res of [
			await app.inject({ method: "GET", url: "/api/files" }),
			await register(undefined),
			await complete(someId),
			await download(someId),
			await remove(someId),
		]) {
			expect(res.statusCode).toBe(401);
			expect(errorResponseSchema.parse(res.json()).error).toBe("unauthorized");
		}
	});
});

describe("POST /api/files (register)", () => {
	it("returns a signed upload URL and the headers to send, and lists nothing yet", async () => {
		const cookie = await signIn("ada@example.com");
		const res = await register(cookie);
		expect(res.statusCode).toBe(201);
		const target = createFileResponseSchema.parse(res.json());
		expect(target.uploadHeaders).toEqual({ "Content-Type": "text/plain" });

		// The key is the user's prefix and a random id, never the file's own name.
		const [row] = await app.db.select().from(files);
		expect(row?.storageKey).toMatch(/^users\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/);
		expect(row?.uploadedAt).toBeNull();
		// Pending files aren't listed: there's nothing to download yet.
		expect(await list(cookie)).toEqual([]);
	});

	it("400 on a file that's too big, empty, or has no real type", async () => {
		const cookie = await signIn("ada@example.com");
		for (const body of [
			{ ...notes, sizeBytes: MAX_FILE_BYTES + 1 },
			{ ...notes, sizeBytes: 0 },
			{ ...notes, contentType: "" },
			{ ...notes, fileName: "  " },
		]) {
			const res = await register(cookie, body);
			expect(res.statusCode).toBe(400);
			expect(errorResponseSchema.parse(res.json()).error).toBe(
				"validation_failed",
			);
		}
		expect(await app.db.select().from(files)).toEqual([]);
	});
});

describe("POST /api/files/:id/complete", () => {
	it("marks the file uploaded once the bucket has it, and lists it", async () => {
		const cookie = await signIn("ada@example.com");
		const file = await upload(cookie);
		expect(file).toMatchObject({ fileName: "notes.txt", sizeBytes: 11 });
		expect(await list(cookie)).toEqual([file]);
		// Twice is fine: the same file again.
		expect((await complete(file.id, cookie)).json()).toEqual(file);
	});

	it("409 before the PUT arrived, and keeps the row for a retry", async () => {
		const cookie = await signIn("ada@example.com");
		const target = createFileResponseSchema.parse(
			(await register(cookie)).json(),
		);

		const early = await complete(target.id, cookie);
		expect(early.statusCode).toBe(409);
		expect(errorResponseSchema.parse(early.json()).error).toBe(
			"upload_incomplete",
		);

		storage.put(target.uploadUrl, notes.sizeBytes);
		expect((await complete(target.id, cookie)).statusCode).toBe(200);
	});

	it("400 when the stored size differs from the registered one; drops the row and the object", async () => {
		const cookie = await signIn("ada@example.com");
		const target = createFileResponseSchema.parse(
			(await register(cookie)).json(),
		);
		storage.put(target.uploadUrl, 999);

		const res = await complete(target.id, cookie);
		expect(res.statusCode).toBe(400);
		expect(errorResponseSchema.parse(res.json()).error).toBe(
			"upload_size_mismatch",
		);
		expect(await app.db.select().from(files)).toEqual([]);
		expect(storage.objects.size).toBe(0);
	});
});

describe("GET /api/files/:id/download", () => {
	it("returns a signed URL that saves the file under its name", async () => {
		const cookie = await signIn("ada@example.com");
		const file = await upload(cookie, { ...notes, fileName: "résumé.pdf" });

		const res = await download(file.id, cookie);
		expect(res.statusCode).toBe(200);
		const { url } = downloadResponseSchema.parse(res.json());
		expect(new URL(url).searchParams.get("download")).toBe("résumé.pdf");
	});

	it("404 while the upload is still pending", async () => {
		const cookie = await signIn("ada@example.com");
		const target = createFileResponseSchema.parse(
			(await register(cookie)).json(),
		);
		expect((await download(target.id, cookie)).statusCode).toBe(404);
	});
});

describe("DELETE /api/files/:id", () => {
	it("removes the row and the object", async () => {
		const cookie = await signIn("ada@example.com");
		const file = await upload(cookie);

		const res = await remove(file.id, cookie);
		expect(res.statusCode).toBe(204);
		expect(await list(cookie)).toEqual([]);
		expect(storage.objects.size).toBe(0);
	});
});

// Authorization: Bob can't see, finish, download or delete Ada's file. Each answer is the same 404 as a file
// that doesn't exist, so Bob can't even learn that the id is real.
describe("user A and user B", () => {
	it("B gets 404 on A's file, and A's file is untouched", async () => {
		const ada = await signIn("ada@example.com");
		const bob = await signIn("bob@example.com");
		const file = await upload(ada);

		expect(await list(bob)).toEqual([]);
		for (const res of [
			await complete(file.id, bob),
			await download(file.id, bob),
			await remove(file.id, bob),
		]) {
			expect(res.statusCode).toBe(404);
			expect(errorResponseSchema.parse(res.json()).error).toBe("not_found");
		}
		expect(await list(ada)).toEqual([file]);
		expect(storage.objects.size).toBe(1);
	});

	it("B can't complete A's pending upload", async () => {
		const ada = await signIn("ada@example.com");
		const bob = await signIn("bob@example.com");
		const target = createFileResponseSchema.parse((await register(ada)).json());
		storage.put(target.uploadUrl, notes.sizeBytes);

		expect((await complete(target.id, bob)).statusCode).toBe(404);
		expect((await complete(target.id, ada)).statusCode).toBe(200);
	});
});

describe("without a bucket (no S3_* settings)", () => {
	it("has no file routes: 404", async () => {
		const bare = buildApp(testConfig({ DATABASE_URL: testDatabaseUrl() }));
		try {
			const res = await bare.inject({ method: "GET", url: "/api/files" });
			expect(res.statusCode).toBe(404);
		} finally {
			await bare.close();
		}
	});
});
