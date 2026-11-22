import { files, jobs, members, users } from "@launchpad/db";
import { testDatabaseUrl } from "@launchpad/db/testing";
import {
	type CreateFileBody,
	createFileResponseSchema,
	downloadResponseSchema,
	errorResponseSchema,
	fileListResponseSchema,
	fileSchema,
	MAX_FILE_BYTES,
	STORAGE_QUOTA_BYTES,
	sessionResponseSchema,
} from "@launchpad/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "#app.ts";
import { handlers } from "#lib/jobs/handlers.ts";
import { createLogger } from "#lib/logger.ts";
import { createMemoryStorageDriver } from "#lib/storage/memory-driver.ts";
import { testConfig } from "#testing/config.ts";
import { signInWithCode } from "#testing/sign-in.ts";

const APP_URL = "https://app.example.test";
const storage = createMemoryStorageDriver();
// S3_BUCKET set (the keys don't matter: the memory driver is passed in) so account deletion queues file cleanup.
// Every request here comes from one IP, and this file makes well over the default 100 a minute; the rate limit
// has its own test (app.test.ts).
const app = buildApp(
	testConfig({ DATABASE_URL: testDatabaseUrl(), APP_URL, S3_BUCKET: "test" }),
	{ storage, rateLimitMax: 10_000 },
);
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

const someId = "00000000-0000-4000-8000-000000000000";

// The signed-in user's organization (decision 010: they have exactly one), as the web app reads it.
// Cached per cookie: one get-session per sign-in, not per request (the API rate-limits each client).
const orgIds = new Map<string, string>();
const orgOf = async (cookie: string | undefined) => {
	if (!cookie) return someId;
	const cached = orgIds.get(cookie);
	if (cached) return cached;
	const session = sessionResponseSchema.parse(
		(
			await app.inject({
				method: "GET",
				url: "/api/auth/get-session",
				headers: { cookie },
			})
		).json(),
	);
	const id = session?.session.activeOrganizationId;
	if (!id) throw new Error("no active organization");
	orgIds.set(cookie, id);
	return id;
};
// Each helper calls its route in the caller's own organization, or in `org` when given (to try someone else's).
const filesUrl = async (cookie: string | undefined, path = "", org?: string) =>
	`/api/organizations/${org ?? (await orgOf(cookie))}/files${path}`;

const register = async (
	cookie: string | undefined,
	body: object = notes,
	org?: string,
) =>
	app.inject({
		method: "POST",
		url: await filesUrl(cookie, "", org),
		payload: body,
		...(cookie && { headers: { cookie } }),
	});
const complete = async (id: string, cookie?: string, org?: string) =>
	app.inject({
		method: "POST",
		url: await filesUrl(cookie, `/${id}/complete`, org),
		...(cookie && { headers: { cookie } }),
	});
const download = async (id: string, cookie?: string, org?: string) =>
	app.inject({
		method: "GET",
		url: await filesUrl(cookie, `/${id}/download`, org),
		...(cookie && { headers: { cookie } }),
	});
const remove = async (id: string, cookie?: string, org?: string) =>
	app.inject({
		method: "DELETE",
		url: await filesUrl(cookie, `/${id}`, org),
		...(cookie && { headers: { cookie } }),
	});
const listResponse = async (cookie?: string, org?: string) =>
	app.inject({
		method: "GET",
		url: await filesUrl(cookie, "", org),
		...(cookie && { headers: { cookie } }),
	});
const list = async (cookie: string) =>
	fileListResponseSchema.parse((await listResponse(cookie)).json()).files;

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

describe("without a session", () => {
	it("401 on every file route", async () => {
		for (const res of [
			await listResponse(),
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

		// The key is the organization's prefix and a random id, never the file's own name. The row records both
		// the organization (who owns it) and the user (who uploaded it).
		const [row] = await app.db.select().from(files);
		const orgId = await orgOf(cookie);
		expect(row?.storageKey).toMatch(
			new RegExp(`^organizations/${orgId}/[0-9a-f-]{36}$`),
		);
		expect(row?.organizationId).toBe(orgId);
		expect(row?.userId).toEqual(expect.any(String));
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

// One file can't reach the quota (25 MB of 1 GB), so the tests grow a registered row to fill the rest.
describe("storage quota", () => {
	async function fillUpTo(cookie: string, usedBytes: number) {
		const target = createFileResponseSchema.parse(
			(await register(cookie)).json(),
		);
		await app.db
			.update(files)
			.set({ sizeBytes: usedBytes })
			.where(eq(files.id, target.id));
	}

	it("413 when the upload would pass the quota; exactly up to it is fine", async () => {
		const cookie = await signIn("ada@example.com");
		await fillUpTo(cookie, STORAGE_QUOTA_BYTES - 11);

		const over = await register(cookie, { ...notes, sizeBytes: 12 });
		expect(over.statusCode).toBe(413);
		expect(errorResponseSchema.parse(over.json()).error).toBe(
			"storage_quota_exceeded",
		);
		expect(
			(await register(cookie, { ...notes, sizeBytes: 11 })).statusCode,
		).toBe(201);
	});

	it("counts pending uploads: their bytes may already be in the bucket", async () => {
		const cookie = await signIn("ada@example.com");
		await fillUpTo(cookie, STORAGE_QUOTA_BYTES); // registered, never completed
		expect((await register(cookie)).statusCode).toBe(413);
	});

	it("deleting a file frees its space", async () => {
		const cookie = await signIn("ada@example.com");
		const file = await upload(cookie);
		await app.db
			.update(files)
			.set({ sizeBytes: STORAGE_QUOTA_BYTES })
			.where(eq(files.id, file.id));
		expect((await register(cookie)).statusCode).toBe(413);

		await remove(file.id, cookie);
		expect((await register(cookie)).statusCode).toBe(201);
	});

	it("is per organization: A's full quota doesn't block B", async () => {
		const ada = await signIn("ada@example.com");
		const bob = await signIn("bob@example.com");
		await fillUpTo(ada, STORAGE_QUOTA_BYTES);
		expect((await register(bob)).statusCode).toBe(201);
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

// Tenant isolation (decision 011): Bob, a member of org B, can't see, add to, finish, download or delete anything
// in org A, from either side. Each answer is the same 404 as something that doesn't exist, so Bob can't even
// learn that an id is real.
describe("org A and org B", () => {
	const expectNotFound = (res: { statusCode: number; json: () => unknown }) => {
		expect(res.statusCode).toBe(404);
		expect(errorResponseSchema.parse(res.json()).error).toBe("not_found");
	};

	it("in org A's URLs, B gets 404 on every route: requireMembership", async () => {
		const ada = await signIn("ada@example.com");
		const bob = await signIn("bob@example.com");
		const orgA = await orgOf(ada);
		const file = await upload(ada);

		for (const res of [
			await listResponse(bob, orgA),
			await register(bob, notes, orgA),
			await complete(file.id, bob, orgA),
			await download(file.id, bob, orgA),
			await remove(file.id, bob, orgA),
		]) {
			expectNotFound(res);
		}
		expect(await list(ada)).toEqual([file]);
		expect(storage.objects.size).toBe(1);
	});

	it("in org B's own URLs, A's file ids are 404: every query filters on the org", async () => {
		const ada = await signIn("ada@example.com");
		const bob = await signIn("bob@example.com");
		const file = await upload(ada);

		expect(await list(bob)).toEqual([]);
		for (const res of [
			await complete(file.id, bob),
			await download(file.id, bob),
			await remove(file.id, bob),
		]) {
			expectNotFound(res);
		}
		expect(await list(ada)).toEqual([file]);
	});

	it("B can't complete A's pending upload", async () => {
		const ada = await signIn("ada@example.com");
		const bob = await signIn("bob@example.com");
		const target = createFileResponseSchema.parse((await register(ada)).json());
		storage.put(target.uploadUrl, notes.sizeBytes);

		expect((await complete(target.id, bob)).statusCode).toBe(404);
		expect((await complete(target.id, bob, await orgOf(ada))).statusCode).toBe(
			404,
		);
		expect((await complete(target.id, ada)).statusCode).toBe(200);
	});

	it("400 on an organization id that isn't a uuid", async () => {
		const ada = await signIn("ada@example.com");
		expect((await listResponse(ada, "not-a-uuid")).statusCode).toBe(400);
	});
});

// RBAC: what a role may do. Everyone owns their organization today (decision 010); a team's `member` would read
// and upload, and only admins and owners delete.
describe("roles", () => {
	const demote = async (email: string) => {
		const [user] = await app.db
			.select()
			.from(users)
			.where(eq(users.email, email));
		await app.db
			.update(members)
			.set({ role: "member" })
			.where(eq(members.userId, user?.id ?? ""));
	};

	it("a member lists, uploads and downloads, but deleting is 403", async () => {
		const ada = await signIn("ada@example.com");
		const file = await upload(ada);
		await demote("ada@example.com");

		expect(await list(ada)).toHaveLength(1);
		expect((await download(file.id, ada)).statusCode).toBe(200);
		await upload(ada, { ...notes, fileName: "second.txt" });

		const res = await remove(file.id, ada);
		expect(res.statusCode).toBe(403);
		expect(errorResponseSchema.parse(res.json()).error).toBe("forbidden");
		expect(await list(ada)).toHaveLength(2);
	});
});

// An account's files go with it (11.4), now through its organization (12.2). The rows cascade with the
// organization at once; the objects are removed by jobs, delayed past the life of any upload URL signed just
// before: one for the organization's prefix, one for what the user uploaded before 12.2 under theirs.
describe("deleting the account", () => {
	const context = {
		jobId: "",
		db: app.db,
		email: { send: async () => ({}) },
		storage,
		log: createLogger("silent"),
		signal: new AbortController().signal,
	};
	const queued = async (type: string) => {
		const [job] = await app.db.select().from(jobs).where(eq(jobs.type, type));
		expect(job?.runAfter.getTime()).toBeGreaterThan(
			Date.now() + 15 * 60 * 1000,
		);
		return job?.payload;
	};

	it("removes the organization's rows now and queues the bucket cleanup; the jobs delete only its objects", async () => {
		const ada = await signIn("ada@example.com");
		const bob = await signIn("bob@example.com");
		const orgA = await orgOf(ada);
		await upload(ada);
		await upload(ada, { ...notes, fileName: "second.txt" });
		await upload(bob);
		const [adaUser] = await app.db
			.select()
			.from(users)
			.where(eq(users.email, "ada@example.com"));
		if (!adaUser) throw new Error("no user");
		// Uploaded before 12.2, under the old per-user prefix.
		storage.objects.set(`users/${adaUser.id}/legacy`, 5);

		const res = await app.inject({
			method: "POST",
			url: "/api/auth/delete-user",
			headers: { cookie: ada, origin: APP_URL },
			payload: {},
		});
		expect(res.statusCode).toBe(200);
		expect(
			await app.db.select().from(files).where(eq(files.organizationId, orgA)),
		).toEqual([]);
		expect(await queued("delete-organization-files")).toEqual({
			organizationId: orgA,
		});
		expect(await queued("delete-user-files")).toEqual({ userId: adaUser.id });

		// What the worker does when the jobs come due.
		await handlers["delete-organization-files"](
			{ organizationId: orgA },
			context,
		);
		await handlers["delete-user-files"]({ userId: adaUser.id }, context);
		expect([...storage.objects.keys()]).toEqual([
			expect.stringContaining(`organizations/${await orgOf(bob)}/`),
		]);
		expect(await list(bob)).toHaveLength(1);
	});
});

describe("without a bucket (no S3_* settings)", () => {
	it("has no file routes: 404", async () => {
		const bare = buildApp(testConfig({ DATABASE_URL: testDatabaseUrl() }));
		try {
			const res = await bare.inject({
				method: "GET",
				url: `/api/organizations/${someId}/files`,
			});
			expect(res.statusCode).toBe(404);
		} finally {
			await bare.close();
		}
	});
});
