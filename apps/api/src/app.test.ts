import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.ts";

const app = buildApp({ NODE_ENV: "test", PORT: 0, LOG_LEVEL: "silent" });
afterAll(() => app.close());

describe("probes", () => {
	it("GET /api/health → 200 ok", async () => {
		const res = await app.inject({ method: "GET", url: "/api/health" });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ status: "ok" });
	});

	it("GET /api/ready → 200 ok", async () => {
		const res = await app.inject({ method: "GET", url: "/api/ready" });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ status: "ok" });
	});
});

describe("request ID", () => {
	it("generates a UUID when the caller sends none", async () => {
		const res = await app.inject({ method: "GET", url: "/api/health" });
		expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
	});

	it("keeps a valid caller ID", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/api/health",
			headers: { "x-request-id": "lb-abc_123" },
		});
		expect(res.headers["x-request-id"]).toBe("lb-abc_123");
	});

	it("replaces an ID that could pollute logs", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/api/health",
			headers: { "x-request-id": "x".repeat(129) },
		});
		expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
	});

	it("is set on 404s too", async () => {
		const res = await app.inject({ method: "GET", url: "/api/nope" });
		expect(res.statusCode).toBe(404);
		expect(res.headers["x-request-id"]).toBeDefined();
	});
});
