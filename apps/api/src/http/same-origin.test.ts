import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "#app.ts";
import { testConfig } from "#testing/config.ts";

// No database: every request here stops at the origin check (403) or at requireSession (401), before any query.
const APP_URL = "https://app.example.com";
const app = buildApp(
	testConfig({ APP_URL, RESEND_WEBHOOK_SECRET: "whsec_dGVzdA==" }),
);
afterAll(() => app.close());

// A route that changes something and needs a session: 401 means the origin check let it through.
const revoke = (headers: Record<string, string>) =>
	app.inject({
		method: "DELETE",
		url: "/api/account/sessions/00000000-0000-4000-8000-000000000000",
		headers,
	});

describe("same-origin check on our own routes", () => {
	it("refuses a state-changing request from another site, before anything else runs", async () => {
		const res = await revoke({ origin: "https://evil.example" });
		expect(res.statusCode).toBe(403);
		expect(res.json()).toEqual({
			error: "forbidden_origin",
			requestId: res.headers["x-request-id"],
		});
	});

	it("refuses a sibling subdomain too (same site to the browser, so it sends the cookie)", async () => {
		expect(
			(await revoke({ origin: "https://other.example.com" })).statusCode,
		).toBe(403);
	});

	it("refuses the opaque `null` origin (sandboxed frames, some redirects)", async () => {
		expect((await revoke({ origin: "null" })).statusCode).toBe(403);
	});

	it("lets our own page through", async () => {
		expect((await revoke({ origin: APP_URL })).statusCode).toBe(401);
	});

	it("lets clients without an Origin through (curl, a mobile app with a bearer token)", async () => {
		expect((await revoke({})).statusCode).toBe(401);
	});

	it("doesn't check reads", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/api/account/sessions",
			headers: { origin: "https://evil.example" },
		});
		expect(res.statusCode).toBe(401);
	});

	it("leaves webhooks to their signature check", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/webhooks/resend",
			headers: {
				origin: "https://evil.example",
				"content-type": "application/json",
			},
			payload: "{}",
		});
		expect(res.statusCode).toBe(401);
		expect(res.json()).toMatchObject({ error: "invalid_signature" });
	});
});
