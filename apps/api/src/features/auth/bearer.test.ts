import { testDatabaseUrl } from "@launchpad/db/testing";
import { accountSessionsResponseSchema } from "@launchpad/shared";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "#app.ts";
import { testConfig } from "#testing/config.ts";
import { signInForToken, signInResponse } from "#testing/sign-in.ts";

// Clients without cookies: the session token travels in an Authorization header instead.
const APP_URL = "https://app.example.test";
const app = buildApp(testConfig({ DATABASE_URL: testDatabaseUrl(), APP_URL }));
afterAll(async () => {
	await app.close();
});

const listSessions = (authorization: string) =>
	app.inject({
		method: "GET",
		url: "/api/account/sessions",
		headers: { authorization },
	});

describe("bearer tokens", () => {
	it("a token from sign-in reaches a protected route", async () => {
		const token = await signInForToken(app, { email: "mia@example.com" });

		const res = await listSessions(`Bearer ${token}`);
		expect(res.statusCode).toBe(200);
		const { sessions } = accountSessionsResponseSchema.parse(res.json());
		expect(sessions.filter((s) => s.current)).toHaveLength(1);
	});

	it("401 for a made-up token, or the bare token without its signature", async () => {
		const token = await signInForToken(app, { email: "noor@example.com" });
		// `<token>.<signature>`: the bare token is what the sessions table stores.
		const [bare] = token.split(".");

		for (const authorization of [
			"Bearer made-up",
			"Bearer made-up.signature",
			`Bearer ${bare}`,
		]) {
			expect((await listSessions(authorization)).statusCode).toBe(401);
		}
	});

	it("signing out with the token ends its session", async () => {
		const token = await signInForToken(app, { email: "omar@example.com" });

		const signOut = await app.inject({
			method: "POST",
			url: "/api/auth/sign-out",
			headers: { authorization: `Bearer ${token}` },
		});
		expect(signOut.statusCode).toBe(200);
		expect((await listSessions(`Bearer ${token}`)).statusCode).toBe(401);
	});

	it("browsers never see the token: it stays in the HttpOnly cookie", async () => {
		// Sec-Fetch-Mode: what a browser's fetch adds by itself, and page scripts can't remove.
		const res = await signInResponse(app, "pia@example.com", {
			origin: APP_URL,
			"sec-fetch-mode": "cors",
		});
		expect(res.statusCode).toBe(200);
		expect(
			res.cookies.some((c) => c.name.endsWith("better-auth.session_token")),
		).toBe(true);
		expect(res.headers["set-auth-token"]).toBeUndefined();
	});
});
