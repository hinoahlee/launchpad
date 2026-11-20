import { testDatabaseUrl } from "@launchpad/db/testing";
import {
	sessionResponseSchema,
	socialSignInResponseSchema,
} from "@launchpad/shared";
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
		expect(sessionResponseSchema.parse(res.json())).toBeNull();
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

describe("Google sign-in", () => {
	const google = buildApp(
		testConfig({
			DATABASE_URL: testDatabaseUrl(),
			APP_URL,
			GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
			GOOGLE_CLIENT_SECRET: "client-secret",
		}),
	);
	afterAll(async () => {
		await google.close();
	});

	const startSignIn = (target = google) =>
		target.inject({
			method: "POST",
			url: "/api/auth/sign-in/social",
			headers: { origin: APP_URL },
			payload: {
				provider: "google",
				callbackURL: "/",
				errorCallbackURL: "/sign-in",
			},
		});

	it("sends the browser to Google, with our callback and PKCE", async () => {
		const res = await startSignIn();
		expect(res.statusCode).toBe(200);
		const { url } = socialSignInResponseSchema.parse(res.json());
		const google = new URL(url);
		expect(google.origin + google.pathname).toBe(
			"https://accounts.google.com/o/oauth2/v2/auth",
		);
		const params = google.searchParams;
		expect(params.get("client_id")).toBe(
			"client-id.apps.googleusercontent.com",
		);
		// Must match a redirect URI listed in the Google client exactly.
		expect(params.get("redirect_uri")).toBe(
			`${APP_URL}/api/auth/callback/google`,
		);
		expect(params.get("response_type")).toBe("code");
		expect(params.get("scope")?.split(" ")).toEqual(
			expect.arrayContaining(["openid", "email", "profile"]),
		);
		expect(params.get("code_challenge_method")).toBe("S256");
		expect(params.get("state")).toBeTruthy();
		expect(params.get("prompt")).toBe("select_account");
	});

	it("is off when no Google client is configured", async () => {
		const res = await startSignIn(app);
		expect(res.statusCode).toBe(404);
	});

	// Someone opens the callback without starting a sign-in here (or after it expired): our page explains it.
	it("sends a failed callback to our sign-in page with the error", async () => {
		const res = await google.inject({
			method: "GET",
			url: "/api/auth/callback/google?code=abc&state=unknown",
		});
		expect(res.statusCode).toBe(302);
		const location = new URL(String(res.headers.location));
		expect(location.origin + location.pathname).toBe(`${APP_URL}/sign-in`);
		expect(location.searchParams.get("error")).toMatch(/^state_/);
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
