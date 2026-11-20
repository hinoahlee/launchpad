// Better Auth sends a failed sign-in back to /sign-in?error=<code>. What each code means for the person.
// Unknown codes get the generic message: Better Auth and Google can add codes without telling us.
const messages: Record<string, string> = {
	// Google: the person pressed Cancel, or closed the consent screen.
	access_denied: "Sign-in was cancelled. Try again when you're ready.",
	// The sign-in started too long ago, in another browser, or the page was opened twice.
	state_mismatch: "That sign-in link expired. Please try again.",
	state_not_found: "That sign-in link expired. Please try again.",
	please_restart_the_process: "That sign-in link expired. Please try again.",
	// Google didn't confirm the address belongs to this person, so we won't attach it to an account.
	email_not_verified:
		"Google hasn't verified this account's email address, so we can't sign you in with it.",
	email_not_found: "Google didn't share an email address for this account.",
	// The Google account already belongs to another user here, or linking it was refused.
	account_already_linked_to_different_user:
		"This Google account is already linked to a different user.",
	unable_to_link_account:
		"We couldn't link this Google account to your existing account.",
};

export const signInErrorMessage = (code: string) =>
	messages[code] ?? "Something went wrong while signing in. Please try again.";
