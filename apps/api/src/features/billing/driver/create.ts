import type { Config } from "#config/schema.ts";
import { createStripeDriver } from "./stripe/driver.ts";
import type { BillingDriver } from "./types.ts";

export function createBillingDriver(config: Config): BillingDriver | undefined {
	const { STRIPE_API_KEY: apiKey, STRIPE_PRICE_ID: priceId } = config;
	if (!apiKey || !priceId) return undefined;
	return createStripeDriver({ apiKey, priceId });
}
