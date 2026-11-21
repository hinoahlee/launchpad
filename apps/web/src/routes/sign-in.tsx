import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { sessionQuery } from "#features/auth/api.ts";
import { SignInCard } from "#features/auth/sign-in-card.tsx";
import { pageTitle } from "#lib/site.ts";

// Where to go after signing in: a path on this site only. "//evil.example" and "/\\evil.example" are other
// sites to a browser, so they're refused (an open redirect would let a phishing link borrow our sign-in page).
const localPath = z
	.string()
	.regex(/^\/(?![/\\])/)
	.optional()
	.catch(undefined);

// /sign-in, and /sign-in?error=<code> when a sign-in failed (Better Auth redirects here: onAPIError in the API).
// ?redirect=/account: where a route guard came from; signing in returns there.
export const Route = createFileRoute("/sign-in")({
	validateSearch: z.object({
		error: z.string().optional(),
		redirect: localPath,
	}),
	component: SignIn,
});

function SignIn() {
	const { error, redirect } = Route.useSearch();
	const session = useQuery(sessionQuery);

	const router = useRouter();
	const signedIn = Boolean(session.data);

	// Signed in (just now, or already: a second tab, the back button): on to where they were going. `redirect` is
	// a checked local path; TanStack's auth example returns to it the same way, through the router's history.
	useEffect(() => {
		if (signedIn) router.history.replace(redirect ?? "/");
	}, [signedIn, redirect, router]);
	if (signedIn) return null;

	return (
		<div className="flex flex-col items-center pt-4 sm:pt-10">
			<title>{pageTitle("Sign in")}</title>
			<SignInCard callbackError={error} redirectTo={redirect ?? "/"} />
		</div>
	);
}
