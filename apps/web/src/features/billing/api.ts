import {
	billingRedirectResponseSchema,
	billingResponseSchema,
} from "@launchpad/shared";
import { queryOptions } from "@tanstack/react-query";
import { api } from "#lib/api/client.ts";

const billingPath = (organizationId: string) =>
	`/organizations/${organizationId}/billing` as const;

export const billingQuery = (organizationId: string) =>
	queryOptions({
		queryKey: ["account", "billing", organizationId],
		queryFn: ({ signal }) =>
			api(billingPath(organizationId), billingResponseSchema, { signal }),
	});

// Refreshes the API copy from Stripe now instead of waiting for the webhook.
export const syncBilling = (organizationId: string) =>
	api(`${billingPath(organizationId)}/sync`, billingResponseSchema, {
		method: "POST",
	});

export const billingRedirect = (
	organizationId: string,
	page: "checkout" | "portal",
) =>
	api(`${billingPath(organizationId)}/${page}`, billingRedirectResponseSchema, {
		method: "POST",
	});
