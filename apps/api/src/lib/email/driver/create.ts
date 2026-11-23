import type { Logger } from "pino";
import type { Config } from "#config/schema.ts";
import { createLogDriver } from "./log/driver.ts";
import { createResendDriver } from "./resend/driver.ts";
import type { EmailDriver } from "./types.ts";

// Resend when configured, otherwise the log driver: the repo runs without an email account.
export function createEmailDriver(config: Config, log: Logger): EmailDriver {
	if (config.RESEND_API_KEY && config.EMAIL_FROM) {
		log.info({ from: config.EMAIL_FROM }, "email: sending through Resend");
		return createResendDriver({
			apiKey: config.RESEND_API_KEY,
			from: config.EMAIL_FROM,
		});
	}
	const level = config.NODE_ENV === "production" ? "warn" : "info";
	log[level](
		"email: no provider configured (RESEND_API_KEY), emails are only logged",
	);
	return createLogDriver(log, {
		includeText: config.NODE_ENV === "development",
	});
}
