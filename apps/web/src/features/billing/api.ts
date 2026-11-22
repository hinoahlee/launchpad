import {
	billingRedirectResponseSchema,
	billingResponseSchema,
} from "@launchpad/shared";
import { queryOptions } from "@tanstack/react-query";
import { ApiError, api } from "#lib/api.ts";

const billingPath = (organizationId: string) =>
	`/organizations/${organizationId}/billing` as const;

// The organization's plan, or null when billing is off: a server without Stripe settings has no billing routes,
// so the API answers 404.
export const billingQuery = (organizationId: string) =>
	queryOptions({
		queryKey: ["account", "billing", organizationId],
		queryFn: async ({ signal }) => {
			try {
				return await api(billingPath(organizationId), billingResponseSchema, {
					signal,
				});
			} catch (error) {
				if (error instanceof ApiError && error.status === 404) return null;
				throw error;
			}
		},
	});

// A Stripe page to send the browser to: Checkout (subscribe) or the Customer Portal (card, cancel, invoices).
export const billingRedirect = (
	organizationId: string,
	page: "checkout" | "portal",
) =>
	api(`${billingPath(organizationId)}/${page}`, billingRedirectResponseSchema, {
		method: "POST",
	});
