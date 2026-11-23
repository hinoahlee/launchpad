import { useMutation } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "#components/ui/alert.tsx";
import { Button } from "#components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#components/ui/card.tsx";
import { ApiError } from "#lib/api/errors.ts";
import { site } from "#lib/site/constants.ts";
import { signInWithGoogle } from "../api.ts";
import { signInErrorMessage } from "../sign-in-error.ts";
import { EmailCodeForm } from "./email-code-form.tsx";
import { GoogleLogo } from "./google-logo.tsx";

function startErrorMessage(error: Error): string {
	if (!(error instanceof ApiError)) {
		return "We couldn't reach the server. Check your connection and try again.";
	}
	if (error.status === 429) {
		return "Too many sign-in attempts. Wait a minute, then try again.";
	}
	if (error.status === 404)
		return "Google sign-in isn't set up on this server.";
	return signInErrorMessage("");
}

// `callbackError`: Better Auth's ?error= code after a failed sign-in.
export function SignInCard({
	callbackError,
	redirectTo,
}: {
	callbackError?: string | undefined;
	redirectTo: string;
}) {
	const google = useMutation({
		mutationFn: () => signInWithGoogle(redirectTo),
	});
	const error = google.error
		? startErrorMessage(google.error)
		: callbackError && !google.isPending && !google.isSuccess
			? signInErrorMessage(callbackError)
			: undefined;
	// Success means the browser is leaving for Google.
	const busy = google.isPending || google.isSuccess;

	return (
		<Card className="w-full max-w-sm">
			<CardHeader>
				<CardTitle>
					<h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
				</CardTitle>
				<CardDescription>Continue to {site.name}.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{error && (
					<Alert variant="destructive">
						<CircleAlert />
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				<Button
					variant="outline"
					size="lg"
					disabled={busy}
					onClick={() => google.mutate()}
				>
					<GoogleLogo />
					{busy ? "Redirecting to Google…" : "Continue with Google"}
				</Button>
				<div className="flex items-center gap-3 text-xs text-muted-foreground uppercase">
					<span aria-hidden className="h-px flex-1 bg-border" />
					or
					<span aria-hidden className="h-px flex-1 bg-border" />
				</div>
				<EmailCodeForm />
			</CardContent>
		</Card>
	);
}
