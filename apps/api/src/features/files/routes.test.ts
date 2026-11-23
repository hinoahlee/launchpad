import {
	billingSubscriptions,
	createDb,
	files,
	jobs,
	members,
	organizations,
	users,
} from "@launchpad/db";
import { testDatabaseUrl } from "@launchpad/db/testing";
import {
	type CreateFileBody,
	createFileResponseSchema,
	downloadResponseSchema,
	ENTITLEMENTS,
	errorResponseSchema,
	fileListResponseSchema,
	fileSchema,
	MAX_FILE_BYTES,
	sessionResponseSchema,
} from "@launchpad/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "#app.ts";
import { handlers } from "#lib/jobs/handlers.ts";
import { jobTypes } from "#lib/jobs/schemas.ts";
import { createLogger } from "#lib/logger.ts";
import { createMemoryStorageDriver } from "#lib/storage/driver/memory/driver.ts";
import { testConfig } from "#testing/config.ts";
import { signInWithCode } from "#testing/sign-in.ts";

const APP_URL = "https://app.example.test";
const storage = createMemoryStorageDriver();
// S3_BUCKET set so account deletion queues file cleanup. The rate limit is raised: every request comes from one IP.
const app = buildApp(
	testConfig({ DATABASE_URL: testDatabaseUrl(), APP_URL, S3_BUCKET: "test" }),
	{ storage, rateLimitMax: 10_000 },
);
afterAll(async () => {
	await app.close();
});
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

// Cached per cookie: one get-session per sign-in.
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

		// The key never contains the file name.
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

// Organizations start on the free plan (no subscription); its quota is the one these tests fill.
const STORAGE_QUOTA_BYTES = ENTITLEMENTS.free.storageQuotaBytes;

// One file can't reach the quota (25 MB of 100 MB), so the tests grow a registered row to fill the rest.
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

	// The quota comes from the plan. Same usage, two plans, two answers.
	it("a free organization is blocked at its quota; a paid one isn't", async () => {
		const cookie = await signIn("ada@example.com");
		await fillUpTo(cookie, ENTITLEMENTS.free.storageQuotaBytes);
		expect((await register(cookie)).statusCode).toBe(413);

		// Paid: what a webhook leaves after Checkout.
		await app.db.insert(billingSubscriptions).values({
			organizationId: await orgOf(cookie),
			stripeSubscriptionId: "sub_test",
			status: "active",
			priceId: "price_test",
			currentPeriodEnd: new Date(Date.now() + 86_400_000),
			cancelAtPeriodEnd: false,
		});
		expect((await register(cookie)).statusCode).toBe(201);
		// Up to the paid plan's own quota.
		await fillUpTo(cookie, ENTITLEMENTS.pro.storageQuotaBytes);
		expect((await register(cookie)).statusCode).toBe(413);

		// Payment fails for good (retries ran out): back to the free quota. At exactly the free quota, Pro would
		// still have room; unpaid doesn't.
		await app.db.delete(files);
		await fillUpTo(cookie, ENTITLEMENTS.free.storageQuotaBytes);
		expect((await register(cookie)).statusCode).toBe(201);
		await app.db.delete(files);
		await fillUpTo(cookie, ENTITLEMENTS.free.storageQuotaBytes);
		await app.db.update(billingSubscriptions).set({ status: "unpaid" });
		expect((await register(cookie)).statusCode).toBe(413);
	});

	// Two uploads at once must not both see room for one. A second connection takes the organization lock and adds a
	// pending file, holding its transaction open: without the lock, the request would sum without that row.
	it("waits for an upload in progress, then counts its bytes", async () => {
		const cookie = await signIn("ada@example.com");
		const organizationId = await orgOf(cookie);
		const [ada] = await app.db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, "ada@example.com"));
		if (!ada) throw new Error("no user");

		const other = createDb(testDatabaseUrl());
		try {
			let release = () => {};
			const held = new Promise<void>((resolve) => {
				release = resolve;
			});
			let locked = () => {};
			const isLocked = new Promise<void>((resolve) => {
				locked = resolve;
			});
			const otherUpload = other.transaction(async (tx) => {
				await tx
					.select({ id: organizations.id })
					.from(organizations)
					.where(eq(organizations.id, organizationId))
					.for("update");
				await tx.insert(files).values({
					organizationId,
					userId: ada.id,
					fileName: "big.bin",
					contentType: "application/octet-stream",
					sizeBytes: STORAGE_QUOTA_BYTES - 5,
					storageKey: `organizations/${organizationId}/${crypto.randomUUID()}`,
				});
				locked();
				await held;
			});
			await isLocked;

			// 11 bytes: fits only if big.bin isn't counted.
			const request = register(cookie);
			let answered = false;
			void request.then(() => {
				answered = true;
			});
			await new Promise((resolve) => setTimeout(resolve, 300));
			expect(answered).toBe(false); // waiting for the lock

			release();
			await otherUpload;
			expect((await request).statusCode).toBe(413);
		} finally {
			await other.$client.end();
		}
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

	// The signed upload URL outlives the delete: a late PUT brings the object back with no row. A second delete,
	// once the URL has expired, removes it.
	it("deletes the object again once its upload URL has expired", async () => {
		const cookie = await signIn("ada@example.com");
		const target = createFileResponseSchema.parse(
			(await register(cookie)).json(),
		);
		storage.put(target.uploadUrl, notes.sizeBytes);
		expect((await complete(target.id, cookie)).statusCode).toBe(200);
		expect((await remove(target.id, cookie)).statusCode).toBe(204);

		const [job] = await app.db
			.select()
			.from(jobs)
			.where(eq(jobs.type, "delete-file-object"));
		expect(job?.runAfter.getTime()).toBeGreaterThan(
			new Date(target.expiresAt).getTime(),
		);

		// The late PUT: the object is back, with no row pointing at it.
		storage.put(target.uploadUrl, notes.sizeBytes);
		expect(storage.objects.size).toBe(1);

		// The worker, when the job comes due.
		await handlers["delete-file-object"](
			jobTypes["delete-file-object"].parse(job?.payload),
			{
				jobId: "",
				db: app.db,
				email: { send: async () => ({}) },
				storage,
				log: createLogger("silent"),
				signal: new AbortController().signal,
			},
		);
		expect(storage.objects.size).toBe(0);
	});
});

// Tenant isolation: Bob (org B) can't touch org A from either side; every answer is a 404, as for a made-up id.
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

// RBAC: what a role may do. Everyone owns their organization today; a team's `member` would read
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

// The rows cascade with the organization at once; the objects go by a job, delayed past any upload URL.
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

	it("removes the organization's rows now and queues the bucket cleanup; the job deletes only its objects", async () => {
		const ada = await signIn("ada@example.com");
		const bob = await signIn("bob@example.com");
		const orgA = await orgOf(ada);
		await upload(ada);
		await upload(ada, { ...notes, fileName: "second.txt" });
		await upload(bob);

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

		await handlers["delete-organization-files"](
			{ organizationId: orgA },
			context,
		);
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
