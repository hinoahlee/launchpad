import { z } from "zod";
import { PLANS } from "../constants.ts";

// GET /api/organizations/:organizationId/billing (any member). Answers even when billing is off.
export const billingResponseSchema = z.object({
	// false: no Stripe settings, so no checkout or portal.
	enabled: z.boolean(),
	// A subscription that hasn't ended: manage it, don't start another.
	subscribed: z.boolean(),
	// Not always "pro" when subscribed: an `incomplete` or `unpaid` subscription is on Free.
	plan: z.enum(PLANS),
});

export type BillingResponse = z.infer<typeof billingResponseSchema>;

// POST .../billing/checkout (409 `already_subscribed`) and .../billing/portal (409 `no_billing_account`), admin+.
export const billingRedirectResponseSchema = z.object({ url: z.url() });

export type BillingRedirectResponse = z.infer<
	typeof billingRedirectResponseSchema
>;
