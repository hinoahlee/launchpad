import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "#components/ui/alert-dialog.tsx";
import { Button } from "#components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#components/ui/card.tsx";
import { ApiError } from "#lib/api.ts";
import { deleteAccount } from "./api.ts";

// Deleting the account, behind a confirmation. The API only deletes for a recent sign-in; if it's too old, the
// dialog offers to sign in again (the page signs out and returns here afterwards).
export function DeleteAccountCard({
	onDeleted,
	onSignInAgain,
}: {
	onDeleted: () => Promise<void>;
	onSignInAgain: () => void;
}) {
	const [open, setOpen] = useState(false);
	const remove = useMutation({
		mutationFn: deleteAccount,
		onSuccess: onDeleted,
	});
	const needsSignIn =
		remove.error instanceof ApiError && remove.error.code === "SESSION_EXPIRED";

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<h2>Delete account</h2>
				</CardTitle>
				<CardDescription>
					Deletes your account, its sign-in methods and every device's session.
					This can't be undone.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<AlertDialog
					open={open}
					onOpenChange={(next) => {
						setOpen(next);
						if (!next) remove.reset();
					}}
				>
					<AlertDialogTrigger render={<Button variant="destructive" />}>
						Delete account
					</AlertDialogTrigger>
					<AlertDialogContent>
						{needsSignIn ? (
							<>
								<AlertDialogHeader>
									<AlertDialogTitle>Sign in again first</AlertDialogTitle>
									<AlertDialogDescription>
										To keep your account safe, deleting it needs a recent
										sign-in. Sign in again, then come back here.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancel</AlertDialogCancel>
									<Button onClick={onSignInAgain}>Sign in again</Button>
								</AlertDialogFooter>
							</>
						) : (
							<>
								<AlertDialogHeader>
									<AlertDialogTitle>Delete your account?</AlertDialogTitle>
									<AlertDialogDescription>
										Your account is deleted right away and you're signed out
										everywhere. This can't be undone.
									</AlertDialogDescription>
								</AlertDialogHeader>
								{remove.isError && (
									<p className="text-sm text-destructive">
										Your account couldn't be deleted. Please try again.
									</p>
								)}
								<AlertDialogFooter>
									<AlertDialogCancel disabled={remove.isPending}>
										Cancel
									</AlertDialogCancel>
									{/* A plain button, not AlertDialogAction: the dialog stays open until the API answers. */}
									<Button
										variant="destructive"
										disabled={remove.isPending}
										onClick={() => remove.mutate()}
									>
										{remove.isPending ? "Deleting…" : "Delete account"}
									</Button>
								</AlertDialogFooter>
							</>
						)}
					</AlertDialogContent>
				</AlertDialog>
			</CardContent>
		</Card>
	);
}
