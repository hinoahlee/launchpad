import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { z } from "zod";
import { sessionQuery } from "#features/auth/api.ts";
import { SignInCard } from "#features/auth/sign-in-card.tsx";
import { pageTitle } from "#lib/site.ts";

// /sign-in, and /sign-in?error=<code> when a sign-in failed (Better Auth redirects here: onAPIError in the API).
export const Route = createFileRoute("/sign-in")({
	validateSearch: z.object({ error: z.string().optional() }),
	component: SignIn,
});

function SignIn() {
	const { error } = Route.useSearch();
	const session = useQuery(sessionQuery);

	// Already signed in (a second tab, the back button): nothing to do here.
	if (session.data) return <Navigate to="/" replace />;

	return (
		<div className="flex flex-col items-center pt-4 sm:pt-10">
			<title>{pageTitle("Sign in")}</title>
			<SignInCard callbackError={error} />
		</div>
	);
}
