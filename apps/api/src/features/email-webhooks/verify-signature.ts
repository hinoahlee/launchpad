import { createHmac, timingSafeEqual } from "node:crypto";

// Resend signs webhooks like Svix: HMAC-SHA256 of `${id}.${timestamp}.${body}` with the endpoint's secret. By hand,
// rather than adding the `svix` package.

type WebhookHeaders = {
	id: string | undefined;
	timestamp: string | undefined;
	signature: string | undefined;
};

const TOLERANCE_SECONDS = 5 * 60;

export function verifyWebhookSignature({
	secret,
	headers: { id, timestamp, signature },
	body,
	now = Date.now(),
}: {
	secret: string;
	headers: WebhookHeaders;
	// Exactly as received: re-serialized JSON may differ.
	body: string;
	now?: number;
}): boolean {
	if (!id || !timestamp || !signature) return false;

	const sentAt = Number(timestamp);
	if (
		!Number.isInteger(sentAt) ||
		Math.abs(now / 1000 - sentAt) > TOLERANCE_SECONDS
	) {
		return false;
	}

	const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
	const expected = createHmac("sha256", key)
		.update(`${id}.${timestamp}.${body}`)
		.digest();

	// Several while a secret is rotated; one match is enough.
	return signature.split(" ").some((entry) => {
		const [version, value] = entry.split(",");
		if (version !== "v1" || !value) return false;
		const given = Buffer.from(value, "base64");
		return given.length === expected.length && timingSafeEqual(given, expected);
	});
}
