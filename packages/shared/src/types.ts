// What a plan allows (values in ENTITLEMENTS, constants.ts).
export type Entitlements = {
	// Pending uploads included. Past it: 413 `storage_quota_exceeded`.
	storageQuotaBytes: number;
};
