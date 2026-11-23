import type { Logger } from "pino";
import type { EmailDriver } from "../types.ts";

// Logs instead of sending. Never the body (sign-in codes) or address, except `includeText` in development so
// the sign-in code shows in the `pnpm dev` terminal.
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
