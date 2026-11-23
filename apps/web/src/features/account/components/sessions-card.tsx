import type { AccountSession } from "@launchpad/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "#components/ui/badge.tsx";
import { Button } from "#components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#components/ui/card.tsx";
import { accountSessionsQuery, revokeSession } from "../api.ts";
import { describeDevice } from "../describe-device.ts";

const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function SessionsCard() {
	const queryClient = useQueryClient();
	const sessions = useQuery(accountSessionsQuery);
	const revoke = useMutation({
		mutationFn: revokeSession,
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: accountSessionsQuery.queryKey,
			}),
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<h2>Devices</h2>
				</CardTitle>
				<CardDescription>
					Where you're signed in. Sign out of any device you don't recognise.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{sessions.isPending && (
					<p className="text-sm text-muted-foreground">Loading…</p>
				)}
				{sessions.isError && (
					<p className="text-sm text-destructive">
						We couldn't load your devices. Refresh to try again.
					</p>
				)}
				{sessions.data && (
					<ul className="flex flex-col divide-y">
						{sessions.data.sessions.map((session) => (
							<SessionRow
								key={session.id}
								session={session}
								busy={revoke.isPending && revoke.variables === session.id}
								onRevoke={() => revoke.mutate(session.id)}
							/>
						))}
					</ul>
				)}
				{revoke.isError && (
					<p className="pt-2 text-sm text-destructive">
						That device couldn't be signed out. Please try again.
					</p>
				)}
			</CardContent>
		</Card>
	);
}

function SessionRow({
	session,
	busy,
	onRevoke,
}: {
	session: AccountSession;
	busy: boolean;
	onRevoke: () => void;
}) {
	return (
		<li className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
			<div className="flex min-w-0 flex-col gap-1">
				<p className="flex items-center gap-2 font-medium">
					{describeDevice(session.userAgent)}
					{session.current && <Badge variant="secondary">This device</Badge>}
				</p>
				<p className="text-sm text-muted-foreground">
					{`Signed in ${date.format(new Date(session.createdAt))} · Last active ${date.format(new Date(session.lastActiveAt))}`}
				</p>
			</div>
			{/* This device signs out with the page button, which also clears the cookie. */}
			{!session.current && (
				<Button variant="outline" size="sm" disabled={busy} onClick={onRevoke}>
					{busy ? "Signing out…" : "Sign out"}
				</Button>
			)}
		</li>
	);
}
