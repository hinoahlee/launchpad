import { z } from "zod";

// GET /api/organizations/:organizationId/billing: the organization's plan, for any member to see. 404 when the
// server has no Stripe setup (billing off).
export const billingResponseSchema = z.object({
	// A subscription that hasn't ended (active, trialing, past due...): manage it, don't start another.
	subscribed: z.boolean(),
});

export type BillingResponse = z.infer<typeof billingResponseSchema>;

// POST .../billing/checkout and .../billing/portal (owners and admins): a Stripe page to send the browser to.
// Checkout: 409 `already_subscribed`. Portal: 409 `no_billing_account` (never started a checkout).
export const billingRedirectResponseSchema = z.object({ url: z.url() });

export type BillingRedirectResponse = z.infer<
	typeof billingRedirectResponseSchema
>;
