import { testDatabaseUrl } from "@launchpad/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "#app.ts";
import { testConfig } from "#testing/config.ts";

const APP_URL = "https://app.example.test";
const app = buildApp(testConfig({ DATABASE_URL: testDatabaseUrl(), APP_URL }));
afterAll(async () => {
	await app.close();
});

describe("/api/auth", () => {
	it("answers through Better Auth (GET /api/auth/ok)", async () => {
		const res = await app.inject({ method: "GET", url: "/api/auth/ok" });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ ok: true });
	});

	it("has no session without a cookie", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/api/auth/get-session",
		});
		expect(res.statusCode).toBe(200);
		expect(res.json()).toBeNull();
	});

	// CSRF: another site's page making the visitor's browser post here, with their cookie attached.
	it("rejects a sign-out posted from another site", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/auth/sign-out",
			headers: {
				origin: "https://evil.example",
				cookie: "better-auth.session_token=stolen",
			},
		});
		expect(res.statusCode).toBe(403);
	});

	it("accepts the same request from our own origin", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/auth/sign-out",
			headers: {
				origin: APP_URL,
				cookie: "better-auth.session_token=stolen",
			},
		});
		expect(res.statusCode).toBe(200);
	});

	it("still serves the rest of /api with its own JSON parsing", async () => {
		const res = await app.inject({ method: "GET", url: "/api/health" });
		expect(res.json()).toEqual({ status: "ok" });
	});
});

describe("schema", () => {
	// Better Auth compares its expected tables and columns with our Drizzle schema (@launchpad/db). A plugin that
	// needs a field we forgot to add fails here, not on a user's first sign-in.
	it("matches what Better Auth expects", async () => {
		const ctx = await app.auth.$context;
		expect(ctx.checkSchema).toBeDefined();
		// Throws the list of differences on a mismatch; nothing once the schema has checked out.
		expect(await ctx.checkSchema?.()).toBeUndefined();
	});
});

describe("production", () => {
	it("refuses to start without APP_URL and BETTER_AUTH_SECRET", () => {
		expect(() =>
			buildApp(testConfig({ NODE_ENV: "production" }), {
				webRoot: import.meta.dirname,
			}),
		).toThrow("APP_URL and BETTER_AUTH_SECRET are required in production");
	});
});
