import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { errorHandler } from "./error-handler.ts";
import { HttpError } from "./errors.ts";

// A route that throws `err`, behind our error handler.
async function thrown(err: Error) {
	const app = Fastify({ logger: false });
	app.setErrorHandler(errorHandler);
	app.get("/", async () => {
		throw err;
	});
	const res = await app.inject({ method: "GET", url: "/" });
	await app.close();
	return { status: res.statusCode, body: res.json() };
}

describe("errorHandler", () => {
	it("a library's upstream status (a Stripe 401) is our 500, not the caller's", async () => {
		const stripeLike = Object.assign(new Error("Invalid API Key provided"), {
			statusCode: 401,
			type: "StripeAuthenticationError",
		});
		expect(await thrown(stripeLike)).toEqual({
			status: 500,
			body: { error: "internal_error" },
		});
	});

	it("keeps the status of our own HttpError", async () => {
		expect(await thrown(new HttpError(429, "slow down"))).toEqual({
			status: 429,
			body: { error: "too_many_requests" },
		});
	});

	it("keeps the status of Fastify's own client errors", async () => {
		const app = Fastify({ logger: false });
		app.setErrorHandler(errorHandler);
		app.post("/", async () => ({}));
		const res = await app.inject({
			method: "POST",
			url: "/",
			headers: { "content-type": "application/json" },
			payload: "{not json",
		});
		await app.close();
		expect(res.statusCode).toBe(400);
		expect(res.json()).toEqual({ error: "bad_request" });
	});
});
