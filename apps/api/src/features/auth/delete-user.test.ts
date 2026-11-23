import { accounts, jobs, sessions, users } from "@launchpad/db";
import { testDatabaseUrl } from "@launchpad/db/testing";
import {
	authErrorResponseSchema,
	deleteAccountResponseSchema,
} from "@launchpad/shared";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "#app.ts";
import { RECENT_SIGN_IN_MINUTES } from "#lib/auth/constants.ts";
import { testConfig } from "#testing/config.ts";
import { signInForToken, signInWithCode } from "#testing/sign-in.ts";

// Account deletion: POST /api/auth/delete-user, Better Auth's endpoint, configured in auth.ts.
const APP_URL = "https://app.example.test";
const app = buildApp(testConfig({ DATABASE_URL: testDatabaseUrl(), APP_URL }));
afterAll(async () => {
	await app.close();
});

const signIn = (email: string) =>
	signInWithCode(app, { email, origin: APP_URL });
const deleteAccount = (headers: Record<string, string>) =>
	app.inject({
		method: "POST",
		url: "/api/auth/delete-user",
		headers: { origin: APP_URL, ...headers },
		payload: {},
	});
const userByEmail = async (email: string) =>
	(await app.db.select().from(users).where(eq(users.email, email)))[0];
const sessionCount = async (userId: string) =>
	(await app.db.select().from(sessions).where(eq(sessions.userId, userId)))
		.length;

describe("POST /api/auth/delete-user", () => {
	// Deleting the users row must take everything of theirs along. A new table that points at users without
	// ON DELETE CASCADE would either block deletion (the default, RESTRICT-like NO ACTION) or keep their data.
	it("every foreign key to users cascades on delete", async () => {
		const notCascading = await app.db.$client<{ constraint: string }[]>`
			select conname as constraint from pg_constraint
			where contype = 'f' and confrelid = 'users'::regclass and confdeltype <> 'c'`;
		expect(notCascading).toEqual([]);
	});

	// This app has no bucket (no S3_BUCKET): no file cleanup job, which a worker without a bucket would fail.
	it("queues no file cleanup when uploads are off", async () => {
		const cookie = await signIn("ivy@example.com");
		expect((await deleteAccount({ cookie })).statusCode).toBe(200);
		expect(
			await app.db
				.select()
				.from(jobs)
				.where(eq(jobs.type, "delete-organization-files")),
		).toEqual([]);
	});

	it("401 without a session", async () => {
		expect((await deleteAccount({})).statusCode).toBe(401);
	});

	it("deletes the user, every session and linked account, and clears the cookie", async () => {
		const email = "quinn@example.com";
		const cookie = await signIn(email);
		// A second device, still signed in.
		await signIn(email);
		const user = await userByEmail(email);
		if (!user) throw new Error("no user");
		expect(await sessionCount(user.id)).toBe(2);

		const res = await deleteAccount({ cookie });
		expect(res.statusCode).toBe(200);
		deleteAccountResponseSchema.parse(res.json());
		const cleared = res.cookies.find((c) =>
			c.name.endsWith("better-auth.session_token"),
		);
		expect(cleared?.maxAge).toBe(0);

		expect(await userByEmail(email)).toBeUndefined();
		expect(await sessionCount(user.id)).toBe(0);
		expect(
			await app.db.select().from(accounts).where(eq(accounts.userId, user.id)),
		).toHaveLength(0);
		// The old cookie is now nobody's.
		const after = await app.inject({
			method: "GET",
			url: "/api/account/sessions",
			headers: { cookie },
		});
		expect(after.statusCode).toBe(401);
	});

	it(`refuses a session older than ${RECENT_SIGN_IN_MINUTES} minutes, and keeps the account`, async () => {
		const email = "rosa@example.com";
		const cookie = await signIn(email);
		const user = await userByEmail(email);
		if (!user) throw new Error("no user");
		// Signed in a minute too long ago.
		await app.db
			.update(sessions)
			.set({
				createdAt: new Date(Date.now() - (RECENT_SIGN_IN_MINUTES + 1) * 60_000),
			})
			.where(eq(sessions.userId, user.id));

		const res = await deleteAccount({ cookie });
		expect(res.statusCode).toBe(400);
		expect(authErrorResponseSchema.parse(res.json()).code).toBe(
			"SESSION_EXPIRED",
		);
		expect(await userByEmail(email)).toBeDefined();

		// Signing in again gives a fresh session, which may delete.
		const fresh = await signIn(email);
		expect((await deleteAccount({ cookie: fresh })).statusCode).toBe(200);
		expect(await userByEmail(email)).toBeUndefined();
	});

	// The queued emails (sign-in codes included) carry the address; failed ones would be kept forever.
	it("removes the emails queued to the deleted address, and no one else's", async () => {
		const toAddress = (email: string) =>
			app.db.$client<{ id: string }[]>`
				select id from jobs where type = 'send_email' and payload->>'to' = ${email}`;
		const cookie = await signIn("wes@example.com");
		await signIn("xan@example.com");
		await app.db
			.update(jobs)
			.set({ status: "failed" })
			.where(eq(jobs.type, "send_email"));

		expect((await deleteAccount({ cookie })).statusCode).toBe(200);
		expect(await toAddress("wes@example.com")).toEqual([]);
		expect(await toAddress("xan@example.com")).toHaveLength(1);
	});

	it("deletes only the signed-in user", async () => {
		const cookie = await signIn("sam@example.com");
		await signIn("tess@example.com");

		expect((await deleteAccount({ cookie })).statusCode).toBe(200);
		expect(await userByEmail("sam@example.com")).toBeUndefined();
		expect(await userByEmail("tess@example.com")).toBeDefined();
	});

	it("works with a bearer token (a mobile app)", async () => {
		const email = "uma@example.com";
		const token = await signInForToken(app, { email });

		const res = await app.inject({
			method: "POST",
			url: "/api/auth/delete-user",
			headers: { authorization: `Bearer ${token}` },
			payload: {},
		});
		expect(res.statusCode).toBe(200);
		expect(await userByEmail(email)).toBeUndefined();
	});

	it("an address can sign up again after deleting: a new, empty account", async () => {
		const email = "vic@example.com";
		const cookie = await signIn(email);
		const before = await userByEmail(email);
		expect((await deleteAccount({ cookie })).statusCode).toBe(200);

		await signIn(email);
		const after = await userByEmail(email);
		expect(after?.id).toBeDefined();
		expect(after?.id).not.toBe(before?.id);
	});
});
