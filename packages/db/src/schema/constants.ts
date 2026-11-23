// Allowed values of text columns; each table's CHECK constraint lists the same values.
export const ROLES = ["owner", "admin", "member"] as const;
export type Role = (typeof ROLES)[number];

export const INVITATION_STATUSES = [
	"pending",
	"accepted",
	"rejected",
	"canceled",
] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const JOB_STATUSES = ["queued", "running", "done", "failed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const SUPPRESSION_REASONS = ["bounce", "complaint"] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];
