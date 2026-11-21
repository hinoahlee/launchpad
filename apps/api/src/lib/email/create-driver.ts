import type { Logger } from "pino";
import type { Config } from "#config.ts";
import type { EmailDriver } from "./driver.ts";
import { createLogDriver } from "./log-driver.ts";
import { createResendDriver } from "./resend-driver.ts";

// The worker's driver, from config: Resend when it's configured, otherwise the log driver, so the repo runs
// with no email account (config.ts requires RESEND_API_KEY and EMAIL_FROM together).
export function createEmailDriver(config: Config, log: Logger): EmailDriver {
	if (config.RESEND_API_KEY && config.EMAIL_FROM) {
		log.info({ from: config.EMAIL_FROM }, "email: sending through Resend");
		return createResendDriver({
			apiKey: config.RESEND_API_KEY,
			from: config.EMAIL_FROM,
		});
	}
	// Loud in production: there, a log driver means emails silently go nowhere.
	const level = config.NODE_ENV === "production" ? "warn" : "info";
	log[level](
		"email: no provider configured (RESEND_API_KEY), emails are only logged",
	);
	return createLogDriver(log, {
		includeText: config.NODE_ENV === "development",
	});
}
