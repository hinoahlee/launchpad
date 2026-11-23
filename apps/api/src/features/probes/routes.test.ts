import { createServer, type Socket } from "node:net";
import { testDatabaseUrl } from "@launchpad/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "#app.ts";
import { testConfig } from "#testing/config.ts";

const app = buildApp(testConfig());
afterAll(() => app.close());

describe("probes", () => {
	it("GET /api/health → 200 ok, even with the database down", async () => {
		// This app's database is unreachable: liveness must not depend on it.
		const res = await app.inject({ method: "GET", url: "/api/health" });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ status: "ok" });
	});

	it("GET /api/ready → 200 ok when the database answers", async () => {
		const ready = buildApp(testConfig({ DATABASE_URL: testDatabaseUrl() }));
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
		expect(res.json()).toEqual({
			error: "database_unavailable",
			requestId: res.headers["x-request-id"],
		});
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
			testConfig({
				DATABASE_URL: `postgres://test:test@127.0.0.1:${address.port}/test`,
			}),
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
