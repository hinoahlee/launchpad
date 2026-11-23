import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { sessionQuery } from "#features/auth/api.ts";
import { SignInCard } from "#features/auth/components/sign-in-card.tsx";
import { pageTitle } from "#lib/site/utils.ts";

// A path on this site only: "//evil.example" and "/\\evil.example" are other sites to a browser (open redirect).
const localPath = z
	.string()
	.regex(/^\/(?![/\\])/)
	.optional()
	.catch(undefined);

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

	// Signed in (just now, or already): on to where they were going.
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
