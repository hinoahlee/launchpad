import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { type AddressInfo, connect } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { testConfig } from "#testing/config.ts";
import { buildApp } from "./app.ts";

// testConfig()'s database is unreachable: these tests need none.
const app = buildApp(testConfig());
afterAll(() => app.close());

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
	// Over the 1 KB below which compression isn't worth it.
	writeFileSync(
		path.join(webRoot, "assets", "big-abc123.js"),
		"console.log(1);\n".repeat(200),
	);

	const web = buildApp(testConfig(), { webRoot });
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
		expect(res.json()).toEqual({
			error: "not_found",
			requestId: res.headers["x-request-id"],
		});
	});

	it("a missing asset → JSON 404, never HTML", async () => {
		const res = await web.inject({ method: "GET", url: "/assets/gone-xyz.js" });
		expect(res.statusCode).toBe(404);
		expect(res.json()).toEqual({
			error: "not_found",
			requestId: res.headers["x-request-id"],
		});
	});

	it("a non-GET to a page path → JSON 404", async () => {
		const res = await web.inject({
			method: "POST",
			url: "/any/route",
			headers: html,
		});
		expect(res.statusCode).toBe(404);
		expect(res.json()).toEqual({
			error: "not_found",
			requestId: res.headers["x-request-id"],
		});
	});

	it("pages carry the security headers", async () => {
		const res = await web.inject({ method: "GET", url: "/", headers: html });
		const csp = String(res.headers["content-security-policy"]);
		expect(csp).toContain("default-src 'self'");
		expect(csp).toContain("script-src 'self'");
		expect(csp).toContain("script-src-attr 'none'");
		expect(csp).toContain("object-src 'none'");
		expect(csp).toContain("frame-ancestors 'none'");
		expect(csp).not.toContain("unsafe-inline");
		expect(res.headers["strict-transport-security"]).toBe(
			"max-age=31536000; includeSubDomains",
		);
		expect(res.headers["x-content-type-options"]).toBe("nosniff");
		expect(res.headers["referrer-policy"]).toBe("no-referrer");
	});

	it("API responses and 404s carry them too", async () => {
		for (const url of ["/api/health", "/api/nope"]) {
			const res = await web.inject({ method: "GET", url });
			expect(res.headers["content-security-policy"]).toBeDefined();
			expect(res.headers["x-content-type-options"]).toBe("nosniff");
		}
	});

	it("compresses text when the client accepts it", async () => {
		const url = "/assets/big-abc123.js";
		const gzip = await web.inject({
			method: "GET",
			url,
			headers: { "accept-encoding": "gzip" },
		});
		expect(gzip.headers["content-encoding"]).toBe("gzip");
		const plain = await web.inject({ method: "GET", url });
		expect(plain.headers["content-encoding"]).toBeUndefined();
		expect(plain.body).toContain("console.log(1);");
	});

	it("production refuses to boot without a web build", () => {
		expect(() =>
			buildApp(
				testConfig({
					NODE_ENV: "production",
					// Production also requires these (auth); set so only the missing build can stop the boot.
					APP_URL: "https://app.example.test",
					BETTER_AUTH_SECRET: "x".repeat(32),
				}),
				{ webRoot: path.join(webRoot, "missing") },
			),
		).toThrow(/SPA build not found/);
	});
});

describe("rate limit", () => {
	// Behind two proxies, as on Render: the socket is Render's load balancer, and X-Forwarded-For ends with
	// "<client>, <cloudflare>". A client can put anything to the left of that.
	const limited = buildApp(testConfig({ TRUST_PROXY_HOPS: 2 }), {
		rateLimitMax: 2,
	});
	afterAll(() => limited.close());

	const from = (client: string, spoofed?: string) => ({
		remoteAddress: "10.0.0.1",
		headers: {
			"x-forwarded-for": [spoofed, client, "104.16.0.1"]
				.filter(Boolean)
				.join(", "),
		},
	});
	const version = (opts: ReturnType<typeof from>) =>
		limited.inject({ method: "GET", url: "/api/version", ...opts });

	it("allows `max` requests per minute, then 429 with Retry-After", async () => {
		const client = from("203.0.113.1");
		const first = await version(client);
		expect(first.statusCode).toBe(200);
		expect(first.headers["x-ratelimit-limit"]).toBe("2");
		expect((await version(client)).statusCode).toBe(200);

		const res = await version(client);
		expect(res.statusCode).toBe(429);
		expect(res.headers["retry-after"]).toBeDefined();
		expect(res.json()).toEqual({
			error: "too_many_requests",
			requestId: res.headers["x-request-id"],
		});
	});

	it("counts each client IP on its own", async () => {
		expect((await version(from("203.0.113.2"))).statusCode).toBe(200);
	});

	it("ignores an X-Forwarded-For value the client made up", async () => {
		const client = "203.0.113.3";
		await version(from(client));
		await version(from(client));
		// A fresh fake IP each time doesn't buy a fresh counter: the real client IP is still read.
		expect((await version(from(client, "198.51.100.7"))).statusCode).toBe(429);
	});

	it("survives a client that hangs up before the limiter runs", async () => {
		const lines: Record<string, unknown>[] = [];
		const aborting = buildApp(testConfig({ LOG_LEVEL: "info" }), {
			logStream: { write: (line) => lines.push(JSON.parse(line)) },
		});
		// Runs before the limiter's own hook (root hooks run first): says the request arrived, then waits until the
		// client is gone, so the limiter always sees a closed socket (no address, `request.ip` undefined). Without
		// this the race is microseconds wide.
		let arrived: () => void = () => {};
		const hasArrived = new Promise<void>((resolve) => {
			arrived = resolve;
		});
		aborting.addHook("onRequest", async (request) => {
			const socket = request.raw.socket;
			arrived();
			if (!socket.destroyed) await once(socket, "close");
		});
		await aborting.listen({ port: 0, host: "127.0.0.1" });
		const { port } = aborting.server.address() as AddressInfo;

		const client = connect(port, "127.0.0.1");
		client.on("error", () => {});
		client.write("GET /api/version HTTP/1.1\r\nHost: test\r\n\r\n");
		await hasArrived;
		client.destroy();
		// The limiter and the error handler run right after the socket closes; give them a moment.
		await new Promise((resolve) => setTimeout(resolve, 100));
		await aborting.close();

		expect(lines.filter((line) => line.msg === "unhandled error")).toEqual([]);
	});

	it("never limits the probes", async () => {
		const client = from("203.0.113.4");
		for (let i = 0; i < 5; i++) {
			const res = await limited.inject({
				method: "GET",
				url: "/api/health",
				...client,
			});
			expect(res.statusCode).toBe(200);
		}
	});
});

describe("request logs", () => {
	// Collects the JSON lines the app writes, instead of printing them.
	function capture(level: "info" | "debug" = "info") {
		const lines: Record<string, unknown>[] = [];
		const logged = buildApp(testConfig({ LOG_LEVEL: level }), {
			logStream: { write: (line) => lines.push(JSON.parse(line)) },
		});
		logged.get("/api/boom", async () => {
			throw new Error('relation "secret_table" does not exist');
		});
		afterAll(() => logged.close());
		// onResponse runs once the response is sent, which can be just after inject() resolves.
		const requestLines = async () => {
			await new Promise((resolve) => setImmediate(resolve));
			return lines.filter((line) => line.msg === "request");
		};
		return { logged, lines, requestLines };
	}

	const { logged, lines, requestLines } = capture();

	it("writes one line per request, with its ID", async () => {
		lines.length = 0;
		const res = await logged.inject({
			method: "GET",
			url: "/api/version?token=abc",
			headers: { "x-request-id": "find-me-123" },
		});
		expect(await requestLines()).toEqual([
			expect.objectContaining({
				level: 30,
				requestId: "find-me-123",
				method: "GET",
				route: "/api/version",
				url: "/api/version", // the query string (and its token) is left out
				status: 200,
				durationMs: expect.any(Number),
			}),
		]);
		expect(res.headers["x-request-id"]).toBe("find-me-123");
		expect(JSON.stringify(lines)).not.toContain("token=abc");
	});

	it("logs a 5xx at error level, with the stack", async () => {
		lines.length = 0;
		await logged.inject({ method: "GET", url: "/api/boom" });
		const [line] = await requestLines();
		expect(line).toMatchObject({ level: 50, status: 500, route: "/api/boom" });
		const error = lines.find((l) => l.msg === "unhandled error");
		expect(error).toMatchObject({
			level: 50,
			requestId: line?.requestId,
			err: { stack: expect.stringContaining("secret_table") },
		});
	});

	it("keeps successful probes out of info", async () => {
		lines.length = 0;
		await logged.inject({ method: "GET", url: "/api/health" });
		expect(await requestLines()).toEqual([]);
	});

	it("still logs a failing probe", async () => {
		lines.length = 0;
		await logged.inject({ method: "GET", url: "/api/ready" });
		expect(await requestLines()).toEqual([
			expect.objectContaining({ status: 503, url: "/api/ready" }),
		]);
	});

	it("logs successful probes at debug", async () => {
		const debug = capture("debug");
		await debug.logged.inject({ method: "GET", url: "/api/health" });
		expect(await debug.requestLines()).toEqual([
			expect.objectContaining({ level: 20, url: "/api/health" }),
		]);
	});
});

describe("errors", () => {
	const failing = buildApp(testConfig());
	failing.get("/api/boom", async () => {
		throw new Error('relation "secret_table" does not exist');
	});
	failing.post("/api/echo", async (request) => request.body);
	// A handler whose return value has a field its response schema doesn't list, and one that breaks it.
	const userSchema = { response: { 200: z.object({ name: z.string() }) } };
	failing.get("/api/leaky", { schema: userSchema }, async () => ({
		name: "Ada",
		passwordHash: "secret-hash",
	}));
	failing.get("/api/broken", { schema: userSchema }, async () => ({
		name: 42,
	}));
	afterAll(() => failing.close());

	it("a response schema drops fields it doesn't list", async () => {
		const res = await failing.inject({ method: "GET", url: "/api/leaky" });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ name: "Ada" });
	});

	it("a response that breaks its schema → 500, never sent as is", async () => {
		const res = await failing.inject({ method: "GET", url: "/api/broken" });
		expect(res.statusCode).toBe(500);
		expect(res.json()).toEqual({
			error: "internal_error",
			requestId: res.headers["x-request-id"],
		});
	});

	it("an unexpected error → 500 with a code and the request ID, never the message", async () => {
		const res = await failing.inject({ method: "GET", url: "/api/boom" });
		expect(res.statusCode).toBe(500);
		expect(res.json()).toEqual({
			error: "internal_error",
			requestId: res.headers["x-request-id"],
		});
		expect(res.body).not.toContain("secret_table");
	});

	it("a client error Fastify raises → its status as a snake_case code", async () => {
		const res = await failing.inject({
			method: "POST",
			url: "/api/echo",
			headers: { "content-type": "application/json" },
			payload: "{not json",
		});
		expect(res.statusCode).toBe(400);
		expect(res.json()).toEqual({
			error: "bad_request",
			requestId: res.headers["x-request-id"],
		});
	});
});
