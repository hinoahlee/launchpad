import type { Config } from "#config.ts";
import type { BillingDriver } from "./driver.ts";
import { createStripeDriver } from "./stripe-driver.ts";

// Stripe from config, or undefined when it isn't set: then the billing routes aren't added (config.ts requires
// the key and the price together).
export function createBillingDriver(config: Config): BillingDriver | undefined {
	const { STRIPE_API_KEY: apiKey, STRIPE_PRICE_ID: priceId } = config;
	if (!apiKey || !priceId) return undefined;
	return createStripeDriver({ apiKey, priceId });
}
