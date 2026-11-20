import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "./webhook-signature.ts";

// Svix's published example (docs.svix.com, "Verifying webhooks manually"): a signature computed by their code, not
// ours, so this checks we follow their algorithm rather than agree with ourselves.
const secret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const body = '{"test": 2432232314}';
const headers = {
	id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
	timestamp: "1614265330",
	signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
};
const sentAt = 1614265330 * 1000;

const verify = (
	overrides: Partial<Parameters<typeof verifyWebhookSignature>[0]>,
) =>
	verifyWebhookSignature({ secret, headers, body, now: sentAt, ...overrides });

describe("verifyWebhookSignature", () => {
	it("accepts the signature Svix computed for this body", () => {
		expect(verify({})).toBe(true);
	});

	it("accepts it among several signatures (during a secret rotation)", () => {
		expect(
			verify({
				headers: {
					...headers,
					signature: `v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= ${headers.signature}`,
				},
			}),
		).toBe(true);
	});

	it("rejects a changed body, another secret, or a missing header", () => {
		expect(verify({ body: '{"test": 2432232315}' })).toBe(false);
		expect(
			verify({ secret: "whsec_c2VjcmV0LXRoYXQtaXMtbm90LXJlc2VuZHM=" }),
		).toBe(false);
		expect(verify({ headers: { ...headers, signature: undefined } })).toBe(
			false,
		);
	});

	it("rejects a request older or newer than 5 minutes (a replayed capture)", () => {
		expect(verify({ now: sentAt + 5 * 60 * 1000 })).toBe(true);
		expect(verify({ now: sentAt + 5 * 60 * 1000 + 1000 })).toBe(false);
		expect(verify({ now: sentAt - 6 * 60 * 1000 })).toBe(false);
	});
});
