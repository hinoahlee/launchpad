import {
	greetingResponseSchema,
	validationErrorResponseSchema,
} from "@launchpad/shared";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "#app.ts";
import { testConfig } from "#testing/config.ts";

// No route here touches the database.
const app = buildApp(testConfig());
afterAll(() => app.close());

describe("GET /api/greeting", () => {
	it("a valid name → 200 with the shared response shape", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/api/greeting?name=%20Ada%20",
		});
		expect(res.statusCode).toBe(200);
		// Parsed with the same schema the web app will use: the contract holds on the wire.
		expect(greetingResponseSchema.parse(res.json())).toEqual({
			message: "Hello, Ada!", // the schema trimmed the spaces before the handler saw them
		});
	});

	it("no name → 400 validation_failed, naming the field", async () => {
		const res = await app.inject({ method: "GET", url: "/api/greeting" });
		expect(res.statusCode).toBe(400);
		const body = validationErrorResponseSchema.parse(res.json());
		expect(body.requestId).toBe(res.headers["x-request-id"]);
		expect(body.details).toEqual([
			{ path: "/name", message: expect.any(String) },
		]);
	});

	it("a name over 50 characters → 400 validation_failed", async () => {
		const res = await app.inject({
			method: "GET",
			url: `/api/greeting?name=${"a".repeat(51)}`,
		});
		expect(res.statusCode).toBe(400);
		expect(res.json()).toMatchObject({
			error: "validation_failed",
			details: [{ path: "/name" }],
		});
	});
});
