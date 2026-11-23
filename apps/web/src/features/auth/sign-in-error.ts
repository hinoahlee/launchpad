// Codes from /sign-in?error=<code>. Unknown ones get the generic message.
const messages: Record<string, string> = {
	access_denied: "Sign-in was cancelled. Try again when you're ready.",
	state_mismatch: "That sign-in link expired. Please try again.",
	state_not_found: "That sign-in link expired. Please try again.",
	please_restart_the_process: "That sign-in link expired. Please try again.",
	email_not_verified:
		"Google hasn't verified this account's email address, so we can't sign you in with it.",
	email_not_found: "Google didn't share an email address for this account.",
	account_already_linked_to_different_user:
		"This Google account is already linked to a different user.",
	unable_to_link_account:
		"We couldn't link this Google account to your existing account.",
};

export const signInErrorMessage = (code: string) =>
	messages[code] ?? "Something went wrong while signing in. Please try again.";
