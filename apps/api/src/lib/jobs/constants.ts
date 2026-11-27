// The NOTIFY channel idle workers LISTEN on.
export const JOBS_CHANNEL = "jobs";

// After this many claims a failing job stays `failed` for a human to look at.
export const MAX_ATTEMPTS = 5;

// Payload fields removed once a job is done or has failed for good: only the email still to be sent needs them,
// and finished jobs are kept for days (a sign-in code's email).
export const SECRET_PAYLOAD_PATHS = ["{props,code}"];
