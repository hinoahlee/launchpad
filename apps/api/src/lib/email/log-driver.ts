import type { Logger } from "pino";
import type { EmailDriver } from "./driver.ts";

// Sends nothing: writes one log line per email. The worker's driver until a provider is configured (9.2).
// Only the subject is logged, never the body or address: bodies will carry sign-in links (secrets), and
// addresses are personal data.
export function createLogDriver(log: Logger): EmailDriver {
	return {
		async send({ subject, idempotencyKey }) {
			log.info({ subject, idempotencyKey }, "email not sent: no provider");
		},
	};
}
