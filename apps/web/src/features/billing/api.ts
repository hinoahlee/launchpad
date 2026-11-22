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

// Asks the API to refresh its copy from Stripe now, instead of waiting for the webhook. Same answer as the query.
export const syncBilling = (organizationId: string) =>
	api(`${billingPath(organizationId)}/sync`, billingResponseSchema, {
		method: "POST",
	});

// A Stripe page to send the browser to: Checkout (subscribe) or the Customer Portal (card, cancel, invoices).
export const billingRedirect = (
	organizationId: string,
	page: "checkout" | "portal",
) =>
	api(`${billingPath(organizationId)}/${page}`, billingRedirectResponseSchema, {
		method: "POST",
	});
