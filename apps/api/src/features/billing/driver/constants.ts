// Every other status is a subscription the customer still has (and manages in the portal).
export const ENDED_STATUSES: ReadonlySet<string> = new Set([
	"canceled",
	"incomplete_expired",
]);
