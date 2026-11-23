import type { Entitlements } from "./types.ts";

// The product's name, used by the web app, the emails and Better Auth. Rename it here.
export const PRODUCT_NAME = "Launchpad";

// How long an emailed sign-in code works. Shown on the sign-in page.
export const SIGN_IN_CODE_MINUTES = 5;

// Larger files would need multipart upload.
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const PLANS = ["free", "pro"] as const;
export type Plan = (typeof PLANS)[number];

const MB = 1024 * 1024;

// The one place a plan's limits are decided: the API enforces them (`entitlementsOf`), the web app shows them.
export const ENTITLEMENTS: Record<Plan, Entitlements> = {
	free: { storageQuotaBytes: 100 * MB },
	// Subscription active, trialing or past due (apps/api/src/lib/entitlements.ts).
	pro: { storageQuotaBytes: 1024 * MB },
};
