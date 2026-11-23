import { SIGN_IN_CODE_MINUTES } from "@launchpad/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Alert, AlertDescription } from "#components/ui/alert.tsx";
import { Button } from "#components/ui/button.tsx";
import { Input } from "#components/ui/input.tsx";
import { Label } from "#components/ui/label.tsx";
import { ApiError } from "#lib/api/errors.ts";
import {
	forgetCachedUserData,
	sendSignInCode,
	sessionQuery,
	signInWithCode,
} from "../api.ts";

function errorMessage(error: Error): string {
	if (!(error instanceof ApiError)) {
		return "We couldn't reach the server. Check your connection and try again.";
	}
	// Our per-address limit, checked before Better Auth's per-IP 429.
	if (error.code === "TOO_MANY_CODES") {
		return "Too many codes were sent to this address. Try again in an hour.";
	}
	if (error.status === 429) {
		return "Too many attempts. Wait a minute, then try again.";
	}
	switch (error.code) {
		case "INVALID_OTP":
			return "That code isn't right. Check the email and try again.";
		case "OTP_EXPIRED":
			return "That code has expired. Send a new one.";
		case "TOO_MANY_ATTEMPTS":
			return "Too many wrong codes. Send a new one.";
		case "INVALID_EMAIL":
			return "Enter a valid email address.";
		default:
			return "Something went wrong. Please try again.";
	}
}

export function EmailCodeForm() {
	const queryClient = useQueryClient();
	const [sentTo, setSentTo] = useState<string>();
	const [lastEmail, setLastEmail] = useState("");
	const [code, setCode] = useState("");

	const send = useMutation({ mutationFn: sendSignInCode });
	const verify = useMutation({
		mutationFn: signInWithCode,
		// Returning the promise keeps the button busy until the session is loaded.
		onSuccess: () => {
			forgetCachedUserData(queryClient);
			return queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey });
		},
	});

	const sendCode = (email: string) => {
		verify.reset();
		send.mutate(email, {
			onSuccess: () => {
				setSentTo(email);
				setCode("");
			},
		});
	};

	const onEmailSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const email = new FormData(event.currentTarget).get("email");
		if (typeof email !== "string") return;
		setLastEmail(email.trim());
		sendCode(email.trim());
	};

	const onCodeSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!sentTo) return;
		send.reset();
		verify.mutate({ email: sentTo, otp: code });
	};

	const error = verify.error ?? send.error;
	const alert = error && (
		<Alert variant="destructive">
			<CircleAlert />
			<AlertDescription>{errorMessage(error)}</AlertDescription>
		</Alert>
	);

	if (!sentTo) {
		return (
			<form onSubmit={onEmailSubmit} className="flex flex-col gap-3">
				{alert}
				<div className="flex flex-col gap-2">
					<Label htmlFor="sign-in-email">Email</Label>
					<Input
						id="sign-in-email"
						name="email"
						type="email"
						autoComplete="email"
						placeholder="you@example.com"
						defaultValue={lastEmail}
						required
						disabled={send.isPending}
					/>
				</div>
				<Button type="submit" size="lg" disabled={send.isPending}>
					{send.isPending ? "Sending…" : "Email me a code"}
				</Button>
			</form>
		);
	}

	const busy = verify.isPending || verify.isSuccess;
	return (
		<form onSubmit={onCodeSubmit} className="flex flex-col gap-3">
			{alert}
			<p className="text-sm text-muted-foreground">
				We sent a 6-digit code to{" "}
				<span className="font-medium text-foreground">{sentTo}</span>. It works
				for {SIGN_IN_CODE_MINUTES} minutes.
			</p>
			<div className="flex flex-col gap-2">
				<Label htmlFor="sign-in-code">Code</Label>
				<Input
					id="sign-in-code"
					name="code"
					inputMode="numeric"
					autoComplete="one-time-code"
					pattern="\d{6}"
					maxLength={6}
					title="The 6 digits from the email"
					required
					value={code}
					onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
					disabled={busy}
				/>
			</div>
			<Button type="submit" size="lg" disabled={busy}>
				{busy ? "Signing in…" : "Sign in"}
			</Button>
			<div className="flex justify-between gap-2">
				<Button
					type="button"
					variant="link"
					className="px-0"
					disabled={busy || send.isPending}
					onClick={() => sendCode(sentTo)}
				>
					{send.isPending ? "Sending…" : "Send a new code"}
				</Button>
				<Button
					type="button"
					variant="link"
					className="px-0"
					disabled={busy}
					onClick={() => {
						send.reset();
						verify.reset();
						setSentTo(undefined);
					}}
				>
					Use a different email
				</Button>
			</div>
		</form>
	);
}
