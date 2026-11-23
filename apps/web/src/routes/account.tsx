import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Navigate,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useCallback, useState } from "react";
import { z } from "zod";
import { Button } from "#components/ui/button.tsx";
import { DeleteAccountCard } from "#features/account/components/delete-account-card.tsx";
import { SessionsCard } from "#features/account/components/sessions-card.tsx";
import { sessionQuery, signOut } from "#features/auth/api.ts";
import { BillingCard } from "#features/billing/components/billing-card.tsx";
import { FilesCard } from "#features/files/components/files-card.tsx";
import { pageTitle } from "#lib/site/utils.ts";

// The guard is for the person, not security: the API checks the session on every request.
export const Route = createFileRoute("/account")({
	// Set by Stripe redirecting back here.
	validateSearch: z.object({
		billing: z.enum(["success", "updated"]).optional().catch(undefined),
	}),
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
	const search = Route.useSearch();
	const dropBillingMarker = useCallback(() => {
		void navigate({ to: "/account", search: {}, replace: true });
	}, [navigate]);
	const signOutMutation = useMutation({
		mutationFn: signOut,
		onSuccess: async () => {
			await navigate({ to: "/" });
			queryClient.setQueryData(sessionQuery.queryKey, null);
			queryClient.removeQueries({ queryKey: ["account"] });
		},
	});
	// Navigate first, so the "signed out while here" redirect below doesn't fire.
	const [leaving, setLeaving] = useState(false);
	const onDeleted = async () => {
		setLeaving(true);
		await navigate({ to: "/" });
		queryClient.setQueryData(sessionQuery.queryKey, null);
		queryClient.removeQueries({ queryKey: ["account"] });
	};
	// Sign out; the redirect below takes them to sign-in and back here.
	const signInAgain = useMutation({
		mutationFn: signOut,
		onSuccess: () => {
			queryClient.setQueryData(sessionQuery.queryKey, null);
			queryClient.removeQueries({ queryKey: ["account"] });
		},
	});
	const user = session.data?.user;
	const organizationId = session.data?.session.activeOrganizationId;

	// Signed out while here (header menu, another tab, revoked elsewhere).
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
			{organizationId && (
				<BillingCard
					organizationId={organizationId}
					returnedFromStripe={search.billing !== undefined}
					onReturnHandled={dropBillingMarker}
				/>
			)}
			{organizationId && <FilesCard organizationId={organizationId} />}
			<SessionsCard />
			<DeleteAccountCard
				onDeleted={onDeleted}
				onSignInAgain={() => signInAgain.mutate()}
			/>
		</div>
	);
}
