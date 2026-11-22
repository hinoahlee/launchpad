import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Navigate,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "#components/ui/button.tsx";
import { DeleteAccountCard } from "#features/account/delete-account-card.tsx";
import { SessionsCard } from "#features/account/sessions-card.tsx";
import { sessionQuery, signOut } from "#features/auth/api.ts";
import { FilesCard } from "#features/files/files-card.tsx";
import { pageTitle } from "#lib/site.ts";

// /account: signed-in users only. The guard runs before the page loads: no session, off to /sign-in, which
// sends you back here once you're in. It's for the person, not for security: the API checks the session on
// every request (requireSession), whatever the browser shows.
export const Route = createFileRoute("/account")({
	beforeLoad: async ({ context, location }) => {
		const session = await context.queryClient.ensureQueryData(sessionQuery);
		if (!session) {
			throw redirect({
				to: "/sign-in",
				search: { redirect: location.pathname },
			});
		}
	},
	component: Account,
});

function Account() {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const session = useQuery(sessionQuery);
	const signOutMutation = useMutation({
		mutationFn: signOut,
		onSuccess: async () => {
			await navigate({ to: "/" });
			queryClient.setQueryData(sessionQuery.queryKey, null);
			queryClient.removeQueries({ queryKey: ["account"] });
		},
	});
	// Account deleted: home, signed out. Navigate first, so the "signed out while here" redirect below doesn't
	// send them to sign-in.
	const [leaving, setLeaving] = useState(false);
	const onDeleted = async () => {
		setLeaving(true);
		await navigate({ to: "/" });
		queryClient.setQueryData(sessionQuery.queryKey, null);
		queryClient.removeQueries({ queryKey: ["account"] });
	};
	// Too long since signing in to delete: sign out, and the redirect below takes them to sign-in and back here.
	const signInAgain = useMutation({
		mutationFn: signOut,
		onSuccess: () => {
			queryClient.setQueryData(sessionQuery.queryKey, null);
			queryClient.removeQueries({ queryKey: ["account"] });
		},
	});
	const user = session.data?.user;
	// The organization your files belong to (12.2). Every session gets one at sign-in; none only if it was deleted.
	const organizationId = session.data?.session.activeOrganizationId;

	// Signed out while here (the header menu, another tab, the session revoked elsewhere): back to sign-in.
	if (session.data === null && !signOutMutation.isPending && !leaving) {
		return <Navigate to="/sign-in" search={{ redirect: "/account" }} replace />;
	}

	return (
		<div className="flex flex-col gap-6 pt-4 sm:pt-10">
			<title>{pageTitle("Account")}</title>
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div className="flex min-w-0 flex-col gap-1">
					<h1 className="text-3xl font-semibold tracking-tight">Account</h1>
					{user && (
						<p className="truncate text-muted-foreground">
							{user.name ? `${user.name} · ${user.email}` : user.email}
						</p>
					)}
				</div>
				<Button
					variant="outline"
					disabled={signOutMutation.isPending}
					onClick={() => signOutMutation.mutate()}
				>
					<LogOut /> Sign out
				</Button>
			</div>
			{organizationId && <FilesCard organizationId={organizationId} />}
			<SessionsCard />
			<DeleteAccountCard
				onDeleted={onDeleted}
				onSignInAgain={() => signInAgain.mutate()}
			/>
		</div>
	);
}
