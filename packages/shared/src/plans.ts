// Plans and their entitlements (13.4): what each plan allows. The one place a limit is decided: the API enforces it
// (features gate on `entitlementsOf`), the web app shows it. A new limit or feature flag goes here first.
export const PLANS = ["free", "pro"] as const;
export type Plan = (typeof PLANS)[number];

export type Entitlements = {
	// How much one organization may store, pending uploads included (a pending upload may already be in the
	// bucket). Registering past it: 413 `storage_quota_exceeded`.
	storageQuotaBytes: number;
};

const MB = 1024 * 1024;

export const ENTITLEMENTS: Record<Plan, Entitlements> = {
	// Every organization without a paying subscription, including all of them when billing is off.
	free: { storageQuotaBytes: 100 * MB },
	// A subscription to STRIPE_PRICE_ID that's active, trialing or past due (see the API's lib/entitlements.ts).
	pro: { storageQuotaBytes: 1024 * MB },
};
