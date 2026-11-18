import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { testDatabaseUrl } from "@launchpad/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.ts";

// Port 1 on this machine: nothing listens there, so every connection is refused at once. Most tests here
// don't need a database; the ones that do build their own app on the test database.
const UNREACHABLE_DB = "postgres://test:test@127.0.0.1:1/test";

const app = buildApp({
	NODE_ENV: "test",
	PORT: 0,
	LOG_LEVEL: "silent",
	GIT_SHA: "abc123",
	DATABASE_URL: UNREACHABLE_DB,
});
afterAll(() => app.close());

describe("probes", () => {
	it("GET /api/health → 200 ok, even with the database down", async () => {
		// This app's database is unreachable: liveness must not depend on it.
		const res = await app.inject({ method: "GET", url: "/api/health" });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ status: "ok" });
	});

	it("GET /api/ready → 200 ok when the database answers", async () => {
		const ready = buildApp({
			NODE_ENV: "test",
			PORT: 0,
			LOG_LEVEL: "silent",
			GIT_SHA: "abc123",
			DATABASE_URL: testDatabaseUrl(),
		});
		try {
			const res = await ready.inject({ method: "GET", url: "/api/ready" });
			expect(res.statusCode).toBe(200);
			expect(res.json()).toEqual({ status: "ok" });
		} finally {
			await ready.close();
		}
	});

	it("GET /api/ready → 503 when the database refuses connections", async () => {
		const res = await app.inject({ method: "GET", url: "/api/ready" });
		expect(res.statusCode).toBe(503);
		expect(res.json()).toEqual({ error: "database_unavailable" });
	});

	it("GET /api/ready → 503 within the timeout when the database never answers", async () => {
		// Accepts TCP connections but never speaks Postgres: the client waits for a reply that never comes,
		// like a database that's overloaded or behind a dropped network path.
		const sockets = new Set<Socket>();
		const silent = createServer((socket) => sockets.add(socket));
		await new Promise<void>((resolve) =>
			silent.listen(0, "127.0.0.1", resolve),
		);
		const address = silent.address();
		if (address === null || typeof address === "string")
			throw new Error("no port");

		const stuck = buildApp(
			{
				NODE_ENV: "test",
				PORT: 0,
				LOG_LEVEL: "silent",
				GIT_SHA: "abc123",
				DATABASE_URL: `postgres://test:test@127.0.0.1:${address.port}/test`,
			},
			{ readyTimeoutMs: 200 },
		);
		try {
			const started = Date.now();
			const res = await stuck.inject({ method: "GET", url: "/api/ready" });
			expect(res.statusCode).toBe(503);
			expect(Date.now() - started).toBeLessThan(2_000);
		} finally {
			// End the pool with no grace period: app.close() alone would give the stuck query its full 5 s.
			await stuck.db.$client.end({ timeout: 0 });
			await stuck.close();
			for (const socket of sockets) socket.destroy();
			silent.close();
		}
	});

	it("GET /api/version → the build's commit", async () => {
		const res = await app.inject({ method: "GET", url: "/api/version" });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ sha: "abc123" });
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

describe("web app", () => {
	// A tiny stand-in for apps/web/dist, so these tests don't depend on a web build.
	const webRoot = mkdtempSync(path.join(tmpdir(), "launchpad-web-"));
	mkdirSync(path.join(webRoot, "assets"));
	writeFileSync(
		path.join(webRoot, "index.html"),
		"<!doctype html><title>app</title>",
	);
	writeFileSync(
		path.join(webRoot, "assets", "index-abc123.js"),
		"console.log(1)",
	);

	const web = buildApp(
		{
			NODE_ENV: "test",
			PORT: 0,
			LOG_LEVEL: "silent",
			GIT_SHA: "abc123",
			DATABASE_URL: "postgres://test:test@localhost:5432/test",
		},
		{ webRoot },
	);
	afterAll(async () => {
		await web.close();
		rmSync(webRoot, { recursive: true, force: true });
	});

	const html = { accept: "text/html,application/xhtml+xml" };
	const NO_CACHE = "no-cache";
	const IMMUTABLE = "public, max-age=31536000, immutable";

	it("GET / → index.html, revalidated every visit", async () => {
		const res = await web.inject({ method: "GET", url: "/", headers: html });
		expect(res.statusCode).toBe(200);
		expect(res.headers["content-type"]).toMatch(/^text\/html/);
		expect(res.body).toContain("<title>app</title>");
		expect(res.headers["cache-control"]).toBe(NO_CACHE);
	});

	it("a client-side route (/any/route) → index.html", async () => {
		const res = await web.inject({
			method: "GET",
			url: "/any/route",
			headers: html,
		});
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain("<title>app</title>");
		expect(res.headers["cache-control"]).toBe(NO_CACHE);
	});

	it("a hashed asset → cached for a year", async () => {
		const res = await web.inject({
			method: "GET",
			url: "/assets/index-abc123.js",
		});
		expect(res.statusCode).toBe(200);
		expect(res.headers["cache-control"]).toBe(IMMUTABLE);
	});

	it("an unknown API route → JSON 404, even from a browser", async () => {
		const res = await web.inject({
			method: "GET",
			url: "/api/nope",
			headers: html,
		});
		expect(res.statusCode).toBe(404);
		expect(res.json()).toEqual({ error: "not_found" });
	});

	it("a missing asset → JSON 404, never HTML", async () => {
		const res = await web.inject({ method: "GET", url: "/assets/gone-xyz.js" });
		expect(res.statusCode).toBe(404);
		expect(res.json()).toEqual({ error: "not_found" });
	});

	it("a non-GET to a page path → JSON 404", async () => {
		const res = await web.inject({
			method: "POST",
			url: "/any/route",
			headers: html,
		});
		expect(res.statusCode).toBe(404);
		expect(res.json()).toEqual({ error: "not_found" });
	});

	it("production refuses to boot without a web build", () => {
		expect(() =>
			buildApp(
				{
					NODE_ENV: "production",
					PORT: 0,
					LOG_LEVEL: "silent",
					GIT_SHA: "abc123",
					DATABASE_URL: "postgres://test:test@localhost:5432/test",
				},
				{ webRoot: path.join(webRoot, "missing") },
			),
		).toThrow(/SPA build not found/);
	});
});
