// Wrong guesses one code survives before it dies.
export const SIGN_IN_CODE_ATTEMPTS = 3;
// Code emails one address may get per rolling hour, across all IPs.
export const SIGN_IN_CODES_PER_HOUR = 5;
// Deleting the account needs a session at most this old (else 400 SESSION_EXPIRED).
export const RECENT_SIGN_IN_MINUTES = 10;

export const PERSONAL_ORGANIZATION_NAME = "Personal";

// Our auth route copies `request.ip` (which honours TRUST_PROXY_HOPS) into this header for Better Auth's rate
// limits. Better Auth's own X-Forwarded-For parsing trusts only a single entry.
export const CLIENT_IP_HEADER = "x-launchpad-client-ip";

// Public, so sessions signed with it prove nothing: production refuses to start without BETTER_AUTH_SECRET.
export const DEV_SECRET = "dev-only-secret-never-used-in-production";
