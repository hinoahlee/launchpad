import type { Logger } from "pino";
import type { EmailDriver } from "./driver.ts";

// Sends nothing: writes one log line per email. The worker's driver when no provider is configured.
// By default only the subject is logged, never the body or address: bodies carry sign-in codes (secrets), and
// addresses are personal data. `includeText` (development only) adds the plain-text body, so you can sign in
// locally with the code printed in the `pnpm dev` terminal.
export function createLogDriver(
	log: Logger,
	{ includeText = false }: { includeText?: boolean } = {},
): EmailDriver {
	return {
		async send({ subject, text, idempotencyKey }) {
			log.info(
				{ subject, idempotencyKey, ...(includeText && { text }) },
				"email not sent: no provider",
			);
			return {};
		},
	};
}
