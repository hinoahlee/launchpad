import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { Button, buttonVariants } from "#components/ui/button.tsx";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#components/ui/dropdown-menu.tsx";
import { sessionQuery, signOut } from "./api.ts";

// The header's account corner: "Sign in" for visitors, the person's initial and a menu once signed in.
export function UserMenu() {
	const queryClient = useQueryClient();
	const session = useQuery(sessionQuery);
	const signOutMutation = useMutation({
		mutationFn: signOut,
		onSuccess: () => queryClient.setQueryData(sessionQuery.queryKey, null),
	});

	// Unknown yet, or the API is down: show nothing rather than a "Sign in" that may be wrong.
	if (session.isPending || session.isError) return null;

	const user = session.data?.user;
	if (!user) {
		return (
			<Link
				to="/sign-in"
				data-slot="button"
				className={buttonVariants({ variant: "ghost" })}
			>
				Sign in
			</Link>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button variant="outline" size="icon" className="rounded-full" />
				}
			>
				<span aria-hidden>
					{(user.name || user.email).charAt(0).toUpperCase()}
				</span>
				<span className="sr-only">Account</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-56">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="flex flex-col">
						{/* Empty for someone who signed up with an email code (no name asked). */}
						{user.name && (
							<span className="truncate font-medium text-foreground">
								{user.name}
							</span>
						)}
						<span className="truncate font-normal">{user.email}</span>
					</DropdownMenuLabel>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					disabled={signOutMutation.isPending}
					onClick={() => signOutMutation.mutate()}
				>
					<LogOut /> Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
