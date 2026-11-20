import { createHmac, timingSafeEqual } from "node:crypto";

// Resend signs each webhook the way Svix (the service that delivers them) does: an HMAC-SHA256 of
// `${id}.${timestamp}.${body}`, keyed with the endpoint's signing secret. Only Resend and we have the secret, so a
// matching signature proves Resend sent this exact body. Without the check, anyone could POST a fake bounce and
// stop emails to any address. Done by hand (a few lines of node:crypto) instead of adding the `svix` package.

export type WebhookHeaders = {
	id: string | undefined;
	timestamp: string | undefined;
	signature: string | undefined;
};

// A captured request replayed later is rejected: Svix's libraries use the same 5 minutes.
const TOLERANCE_SECONDS = 5 * 60;

export function verifyWebhookSignature({
	secret,
	headers: { id, timestamp, signature },
	body,
	now = Date.now(),
}: {
	// "whsec_" + the key in base64, as Resend shows it.
	secret: string;
	headers: WebhookHeaders;
	// The raw body, exactly as received: parsing and re-serializing JSON can change bytes and break the match.
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

	// "v1,<base64> v1,<base64>": several while a secret is being rotated. One match is enough.
	return signature.split(" ").some((entry) => {
		const [version, value] = entry.split(",");
		if (version !== "v1" || !value) return false;
		const given = Buffer.from(value, "base64");
		// Constant time: comparing byte by byte and stopping at the first difference would leak, through response
		// times, how many leading bytes of a guess were right.
		return given.length === expected.length && timingSafeEqual(given, expected);
	});
}
