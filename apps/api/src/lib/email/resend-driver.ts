import { z } from "zod";
import type { EmailDriver } from "./driver.ts";

const RESEND_API = "https://api.resend.com/emails";

export type ResendOptions = {
	apiKey: string;
	// "Name <address@verified-domain>": the domain must be verified in Resend.
	from: string;
	// Tests pass a fake; production uses the global fetch.
	fetch?: typeof fetch;
};

// Resend's success body. Parsed (Zod at every boundary): a different shape means their API changed.
const sentResponse = z.object({ id: z.string() });
// Their error body. Every field optional: on a gateway error the body may not even be JSON.
const errorResponse = z
	.object({ name: z.string(), message: z.string() })
	.partial();

export class ResendError extends Error {
	override name = "ResendError";
	readonly status: number;
	// Resend's error name, e.g. validation_error, rate_limit_exceeded.
	readonly code: string | undefined;
	constructor(status: number, code: string | undefined, message: string) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

// Sends through Resend's HTTP API with plain fetch: one request, so their SDK would add a dependency for
// nothing. Every failure throws, so the job retries with backoff. Retrying helps for 429 (rate limit), 5xx
// and 409 "concurrent" (the first try is still in flight); the rest (bad key, unverified domain, invalid
// address) fail the same way until the job runs out of attempts, and the error message says why.
export function createResendDriver({
	apiKey,
	from,
	fetch: fetchFn = fetch,
}: ResendOptions): EmailDriver {
	return {
		async send({ to, subject, html, text, idempotencyKey }, signal) {
			const res = await fetchFn(RESEND_API, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
					// Resend remembers it for 24 h: a retry with the same key (and the same body) returns the first
					// send's result instead of sending again.
					"Idempotency-Key": idempotencyKey,
				},
				body: JSON.stringify({ from, to: [to], subject, html, text }),
				signal,
			});

			const body: unknown = await res.json().catch(() => undefined);
			if (!res.ok) {
				const error = errorResponse.safeParse(body);
				const { name, message } = error.success ? error.data : {};
				throw new ResendError(
					res.status,
					name,
					`Resend ${res.status}${name ? ` ${name}` : ""}: ${message ?? "no details"}`,
				);
			}
			return { providerId: sentResponse.parse(body).id };
		},
	};
}
