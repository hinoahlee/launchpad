import type * as Sentry from "@sentry/node";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "#app.ts";
import { flushSentry, initSentry } from "#lib/sentry.ts";
import { testConfig } from "#testing/config.ts";

type Transport = ReturnType<NonNullable<Sentry.NodeOptions["transport"]>>;
type Envelope = Parameters<Transport["send"]>[0];
// One item of an envelope: [header, payload]. Loosely typed: the test only reads a few fields.
type EnvelopeItem = [{ type?: string }, Record<string, unknown>];

const config = testConfig({
	SENTRY_DSN: "https://public@o0.ingest.sentry.io/0",
	SENTRY_ENVIRONMENT: "ci",
	DEBUG_ERROR_ROUTE: true,
});

// Instead of sending events over the network, keep them here.
const envelopes: Envelope[] = [];
initSentry(config, {
	transport: () => ({
		send: async (envelope) => {
			envelopes.push(envelope);
			return {};
		},
		flush: async () => true,
	}),
});

// The error events sent so far (envelopes can also hold sessions, client reports...).
async function sentEvents() {
	await new Promise((resolve) => setTimeout(resolve, 50));
	return envelopes
		.flatMap(([, items]) => items as readonly EnvelopeItem[])
		.filter(([header]) => header.type === "event")
		.map(([, event]) => event);
}

const app = buildApp(config);
afterAll(async () => {
	await app.close();
	await flushSentry();
});
beforeEach(() => {
	envelopes.length = 0;
});

describe("error tracking", () => {
	it("reports a 5xx once, with release, environment and request ID", async () => {
		const res = await app.inject({ method: "GET", url: "/api/debug/error" });
		expect(res.statusCode).toBe(500);
		const events = await sentEvents();
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			release: "abc123",
			environment: "ci",
			tags: { requestId: res.headers["x-request-id"] },
			exception: {
				values: [
					{ type: "Error", value: "Test error from GET /api/debug/error" },
				],
			},
		});
	});

	it("doesn't report client errors", async () => {
		await app.inject({ method: "GET", url: "/api/nope" });
		await app.inject({
			method: "POST",
			url: "/api/version",
			headers: { "content-type": "application/json" },
			payload: "{not json",
		});
		expect(await sentEvents()).toEqual([]);
	});

	it("has no debug route unless DEBUG_ERROR_ROUTE is on", async () => {
		const off = buildApp({ ...config, DEBUG_ERROR_ROUTE: false });
		try {
			const res = await off.inject({ method: "GET", url: "/api/debug/error" });
			expect(res.statusCode).toBe(404);
		} finally {
			await off.close();
		}
	});
});
