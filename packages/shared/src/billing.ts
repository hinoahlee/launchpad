import { z } from "zod";

// GET /api/organizations/:organizationId/billing: the organization's plan, for any member to see. Answers even
// when billing is off (no Stripe settings), so the page can tell "off" apart from an error without a 404.
export const billingResponseSchema = z.object({
	// False: this server sells nothing (no Stripe settings), and checkout and portal don't exist.
	enabled: z.boolean(),
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
