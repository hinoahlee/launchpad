import { sessions } from "@launchpad/db";
import { testDatabaseUrl } from "@launchpad/db/testing";
import {
	accountSessionsResponseSchema,
	errorResponseSchema,
} from "@launchpad/shared";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "#app.ts";
import { testConfig } from "#testing/config.ts";
import { signInWithCode } from "#testing/sign-in.ts";

const APP_URL = "https://app.example.test";
const app = buildApp(testConfig({ DATABASE_URL: testDatabaseUrl(), APP_URL }));
afterAll(async () => {
	await app.close();
});

const signIn = (email: string, userAgent?: string) =>
	signInWithCode(app, {
		email,
		origin: APP_URL,
		...(userAgent && { userAgent }),
	});
const listSessions = (cookie?: string) =>
	app.inject({
		method: "GET",
		url: "/api/account/sessions",
		...(cookie && { headers: { cookie } }),
	});
const revoke = (id: string, cookie?: string) =>
	app.inject({
		method: "DELETE",
		url: `/api/account/sessions/${id}`,
		...(cookie && { headers: { cookie } }),
	});
const sessionsOf = async (cookie: string) =>
	accountSessionsResponseSchema.parse((await listSessions(cookie)).json())
		.sessions;

// Authentication: who is asking? No (valid) session → 401, before the route runs.
describe("without a session", () => {
	it("401 on every account route", async () => {
		for (const res of [
			await listSessions(),
			await revoke("00000000-0000-4000-8000-000000000000"),
		]) {
			expect(res.statusCode).toBe(401);
			expect(errorResponseSchema.parse(res.json()).error).toBe("unauthorized");
		}
	});

	it("401 with a made-up or signed-out cookie", async () => {
		expect(
			(await listSessions("better-auth.session_token=made-up")).statusCode,
		).toBe(401);

		const cookie = await signIn("ada@example.com");
		await app.inject({
			method: "POST",
			url: "/api/auth/sign-out",
			headers: { cookie, origin: APP_URL },
		});
		expect((await listSessions(cookie)).statusCode).toBe(401);
	});
});

describe("GET /api/account/sessions", () => {
	it("lists your devices, marks this one, and never shows a token", async () => {
		const laptop = await signIn("ada@example.com", "Laptop");
		await signIn("ada@example.com", "Phone");

		const list = await sessionsOf(laptop);
		expect(list.map((s) => [s.userAgent, s.current]).sort()).toEqual([
			["Laptop", true],
			["Phone", false],
		]);
		expect(JSON.stringify(list)).not.toMatch(/token/i);
	});
});

// Authorization: what may this user touch? Only their own rows.
describe("user A and user B", () => {
	it("A sees only A's sessions", async () => {
		const ada = await signIn("ada@example.com");
		await signIn("bob@example.com");

		expect(await sessionsOf(ada)).toHaveLength(1);
		expect(await app.db.select().from(sessions)).toHaveLength(2);
	});

	it("A can't revoke B's session: 404, and B stays signed in", async () => {
		const ada = await signIn("ada@example.com");
		const bob = await signIn("bob@example.com");
		const [bobSession] = await sessionsOf(bob);

		const res = await revoke(bobSession?.id ?? "", ada);
		expect(res.statusCode).toBe(404);
		expect(errorResponseSchema.parse(res.json()).error).toBe("not_found");
		expect((await listSessions(bob)).statusCode).toBe(200);
	});
});

describe("DELETE /api/account/sessions/:id", () => {
	it("signs that device out, and only that one", async () => {
		const laptop = await signIn("ada@example.com", "Laptop");
		const phone = await signIn("ada@example.com", "Phone");
		const phoneSession = (await sessionsOf(laptop)).find((s) => !s.current);

		const res = await revoke(phoneSession?.id ?? "", laptop);
		expect(res.statusCode).toBe(204);
		expect(res.body).toBe("");
		expect((await listSessions(phone)).statusCode).toBe(401);
		expect(await sessionsOf(laptop)).toHaveLength(1);
	});

	it("an id that isn't a uuid → 400", async () => {
		const cookie = await signIn("ada@example.com");
		expect((await revoke("not-a-uuid", cookie)).statusCode).toBe(400);
	});
});
