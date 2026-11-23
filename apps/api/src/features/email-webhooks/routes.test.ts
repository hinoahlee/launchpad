import { createHmac } from "node:crypto";
import { emailSuppressions } from "@launchpad/db";
import { createTestDb, testDatabaseUrl } from "@launchpad/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "#app.ts";
import { testConfig } from "#testing/config.ts";

const secret = `whsec_${Buffer.from("test-signing-secret").toString("base64")}`;
const app = buildApp(
	testConfig({
		DATABASE_URL: testDatabaseUrl(),
		RESEND_WEBHOOK_SECRET: secret,
	}),
);
const db = createTestDb();
afterAll(async () => {
	await app.close();
	await db.$client.end();
});

// Signs like Resend (the algorithm itself is pinned against Svix's example in verify-signature.test.ts).
function post(event: unknown, { sign = secret } = {}) {
	const body = JSON.stringify(event);
	const id = "msg_test";
	const timestamp = String(Math.floor(Date.now() / 1000));
	const key = Buffer.from(sign.replace("whsec_", ""), "base64");
	const signature = createHmac("sha256", key)
		.update(`${id}.${timestamp}.${body}`)
		.digest("base64");
	return app.inject({
		method: "POST",
		url: "/api/webhooks/resend",
		headers: {
			"content-type": "application/json",
			"svix-id": id,
			"svix-timestamp": timestamp,
			"svix-signature": `v1,${signature}`,
		},
		payload: body,
	});
}

const bounced = (type: string, to = ["gone@example.com"]) => ({
	type: "email.bounced",
	created_at: "2026-11-20T10:00:00.000Z",
	data: {
		email_id: "email_1",
		from: "Launchpad <hello@mail.example.com>",
		to,
		subject: "Welcome",
		bounce: { type, subType: "General", message: "Mailbox does not exist" },
	},
});

const suppressions = () => db.select().from(emailSuppressions);

describe("POST /api/webhooks/resend", () => {
	it("records a permanent bounce", async () => {
		const res = await post(bounced("Permanent"));
		expect(res.statusCode).toBe(204);
		expect(await suppressions()).toMatchObject([
			{ email: "gone@example.com", reason: "bounce" },
		]);
	});

	it("records a spam complaint", async () => {
		await post({
			type: "email.complained",
			data: { email_id: "email_1", to: ["annoyed@example.com"] },
		});
		expect(await suppressions()).toMatchObject([
			{ email: "annoyed@example.com", reason: "complaint" },
		]);
	});

	it("ignores a temporary bounce and other events, still answering 204", async () => {
		expect((await post(bounced("Temporary"))).statusCode).toBe(204);
		expect(
			(
				await post({
					type: "email.delivered",
					data: { to: ["ok@example.com"] },
				})
			).statusCode,
		).toBe(204);
		expect(await suppressions()).toEqual([]);
	});

	it("keeps one row when Resend delivers the same event twice", async () => {
		await post(bounced("Permanent"));
		expect((await post(bounced("Permanent"))).statusCode).toBe(204);
		expect(await suppressions()).toHaveLength(1);
	});

	it("rejects a request not signed with our secret, and records nothing", async () => {
		const forged = `whsec_${Buffer.from("attacker").toString("base64")}`;
		const res = await post(bounced("Permanent"), { sign: forged });
		expect(res.statusCode).toBe(401);
		expect(res.json()).toMatchObject({ error: "invalid_signature" });
		expect(await suppressions()).toEqual([]);
	});

	it("answers 400 to a signed event of an unexpected shape", async () => {
		const res = await post({
			type: "email.bounced",
			data: { to: "not-a-list" },
		});
		expect(res.statusCode).toBe(400);
	});

	it("doesn't exist when no signing secret is configured", async () => {
		const plain = buildApp(testConfig());
		const res = await plain.inject({
			method: "POST",
			url: "/api/webhooks/resend",
		});
		await plain.close();
		expect(res.statusCode).toBe(404);
	});
});
