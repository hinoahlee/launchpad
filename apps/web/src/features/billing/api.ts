import {
	billingRedirectResponseSchema,
	billingResponseSchema,
} from "@launchpad/shared";
import { queryOptions } from "@tanstack/react-query";
import { api } from "#lib/api.ts";

const billingPath = (organizationId: string) =>
	`/organizations/${organizationId}/billing` as const;

// The organization's plan, and whether this server sells one at all (`enabled`).
export const billingQuery = (organizationId: string) =>
	queryOptions({
		queryKey: ["account", "billing", organizationId],
		queryFn: ({ signal }) =>
			api(billingPath(organizationId), billingResponseSchema, { signal }),
	});

// A Stripe page to send the browser to: Checkout (subscribe) or the Customer Portal (card, cancel, invoices).
export const billingRedirect = (
	organizationId: string,
	page: "checkout" | "portal",
) =>
	api(`${billingPath(organizationId)}/${page}`, billingRedirectResponseSchema, {
		method: "POST",
	});
