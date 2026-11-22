import type { Organization, Role } from "@launchpad/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Badge } from "#components/ui/badge.tsx";
import { Button } from "#components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#components/ui/card.tsx";
import { Input } from "#components/ui/input.tsx";
import { Label } from "#components/ui/label.tsx";
import {
	activeMemberQuery,
	createOrganization,
	organizationsKey,
	organizationsQuery,
	setActiveOrganization,
} from "./api.ts";

const roleLabel: Record<Role, string> = {
	owner: "Owner",
	admin: "Admin",
	member: "Member",
};

// The organizations you belong to. One is active on this device: it's where your work goes (from step 12.3).
// Switching or creating one changes the active organization for this session only.
// With only the personal organization, the card shows just the way to create a team: someone who works alone
// never sees "Personal", roles or switching. The list appears once there's a second organization to switch to.
export function OrganizationsCard() {
	const queryClient = useQueryClient();
	const organizations = useQuery(organizationsQuery);
	const activeMember = useQuery(activeMemberQuery);
	const [name, setName] = useState("");

	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: organizationsKey });
	const switchTo = useMutation({
		mutationFn: setActiveOrganization,
		onSuccess: refresh,
	});
	const create = useMutation({
		mutationFn: createOrganization,
		onSuccess: async () => {
			setName("");
			await refresh();
		},
	});

	const onCreate = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!name.trim()) return;
		switchTo.reset();
		create.mutate(name);
	};

	const activeId = activeMember.data?.organizationId;
	const busy = switchTo.isPending || create.isPending;
	const several = (organizations.data?.length ?? 0) > 1;

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<h2>Organizations</h2>
				</CardTitle>
				<CardDescription>
					{several
						? "The teams you belong to. Your work goes to the active one."
						: "Create an organization to work with others."}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{organizations.isPending && (
					<p className="text-sm text-muted-foreground">Loading…</p>
				)}
				{organizations.isError && (
					<p className="text-sm text-destructive">
						We couldn't load your organizations. Refresh to try again.
					</p>
				)}
				{organizations.data && several && (
					<ul className="flex flex-col divide-y">
						{organizations.data.map((organization) => (
							<OrganizationRow
								key={organization.id}
								organization={organization}
								role={
									organization.id === activeId
										? activeMember.data?.role
										: undefined
								}
								active={organization.id === activeId}
								busy={busy}
								switching={
									switchTo.isPending && switchTo.variables === organization.id
								}
								onSwitch={() => {
									create.reset();
									switchTo.mutate(organization.id);
								}}
							/>
						))}
					</ul>
				)}
				{switchTo.isError && (
					<p className="text-sm text-destructive">
						We couldn't switch organizations. Please try again.
					</p>
				)}
				<form
					onSubmit={onCreate}
					className={
						several
							? "flex flex-col gap-2 border-t pt-4"
							: "flex flex-col gap-2"
					}
				>
					<Label htmlFor="new-organization">New organization</Label>
					<div className="flex gap-2">
						<Input
							id="new-organization"
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="Acme Inc."
							maxLength={64}
							required
							disabled={busy}
						/>
						<Button type="submit" disabled={busy || !name.trim()}>
							{create.isPending ? "Creating…" : "Create"}
						</Button>
					</div>
					{create.isError && (
						<p className="text-sm text-destructive">
							We couldn't create that organization. Please try again.
						</p>
					)}
				</form>
			</CardContent>
		</Card>
	);
}

function OrganizationRow({
	organization,
	role,
	active,
	busy,
	switching,
	onSwitch,
}: {
	organization: Organization;
	role: Role | undefined;
	active: boolean;
	busy: boolean;
	switching: boolean;
	onSwitch: () => void;
}) {
	return (
		<li className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
			<p className="flex min-w-0 items-center gap-2 font-medium">
				<span className="truncate">{organization.name}</span>
				{active && <Badge>Active</Badge>}
				{role && <Badge variant="secondary">{roleLabel[role]}</Badge>}
			</p>
			{!active && (
				<Button variant="outline" size="sm" disabled={busy} onClick={onSwitch}>
					{switching ? "Switching…" : "Switch"}
				</Button>
			)}
		</li>
	);
}
