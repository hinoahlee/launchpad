import { describe, expect, it } from "vitest";
import type { OutgoingEmail } from "../types.ts";
import { createResendDriver } from "./driver.ts";

const email: OutgoingEmail = {
	to: "ada@example.com",
	subject: "Welcome",
	html: "<p>Hi</p>",
	text: "Hi",
	idempotencyKey: "job-1",
};

// A fake fetch: records the request, answers with the given status and JSON body.
function fakeFetch(status: number, body: unknown) {
	const calls: { url: string; init: RequestInit }[] = [];
	const fn = (async (url: string, init: RequestInit) => {
		calls.push({ url, init });
		return new Response(JSON.stringify(body), { status });
	}) as typeof fetch;
	return { fn, calls };
}

const driver = (fetch: typeof globalThis.fetch) =>
	createResendDriver({
		apiKey: "re_test",
		from: "Launchpad <hello@mail.example.com>",
		fetch,
	});

describe("Resend driver", () => {
	it("posts the email with the key and idempotency key, and returns Resend's id", async () => {
		const { fn, calls } = fakeFetch(200, { id: "email_123" });

		const result = await driver(fn).send(email, new AbortController().signal);

		expect(result).toEqual({ providerId: "email_123" });
		const [call] = calls;
		expect(call?.url).toBe("https://api.resend.com/emails");
		expect(call?.init.method).toBe("POST");
		expect(call?.init.headers).toMatchObject({
			Authorization: "Bearer re_test",
			"Idempotency-Key": "job-1",
		});
		expect(JSON.parse(String(call?.init.body))).toEqual({
			from: "Launchpad <hello@mail.example.com>",
			to: ["ada@example.com"],
			subject: "Welcome",
			html: "<p>Hi</p>",
			text: "Hi",
		});
	});

	it("throws with Resend's status, error name and message, so the job retries", async () => {
		const { fn } = fakeFetch(403, {
			name: "validation_error",
			message: "The mail.example.com domain is not verified.",
		});

		await expect(
			driver(fn).send(email, new AbortController().signal),
		).rejects.toMatchObject({
			name: "ResendError",
			status: 403,
			code: "validation_error",
			message:
				"Resend 403 validation_error: The mail.example.com domain is not verified.",
		});
	});

	it("throws a readable error when the error body isn't JSON", async () => {
		const fn = (async () =>
			new Response("Bad Gateway", { status: 502 })) as typeof fetch;

		await expect(
			driver(fn).send(email, new AbortController().signal),
		).rejects.toThrow("Resend 502: no details");
	});
});
