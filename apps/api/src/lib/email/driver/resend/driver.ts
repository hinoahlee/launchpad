import { z } from "zod";
import type { EmailDriver } from "../types.ts";
import { ResendError } from "./errors.ts";

const RESEND_API = "https://api.resend.com/emails";

type ResendOptions = {
	apiKey: string;
	from: string;
	fetch?: typeof fetch;
};

const sentResponse = z.object({ id: z.string() });
// A gateway error may not even be JSON.
const errorResponse = z
	.object({ name: z.string(), message: z.string() })
	.partial();

// Plain fetch: one request doesn't justify their SDK. Every failure throws, so the job retries.
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
