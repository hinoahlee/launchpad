import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { Badge } from "#components/ui/badge.tsx";
import { Button } from "#components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#components/ui/card.tsx";
import { ApiError } from "#lib/api.ts";
import { billingQuery, billingRedirect } from "./api.ts";

function errorMessage(error: Error): string {
	if (error instanceof ApiError) {
		if (error.code === "already_subscribed") {
			return "You're already subscribed. Refresh the page to manage your plan.";
		}
		if (error.code === "forbidden") {
			return "Only owners and admins can manage billing.";
		}
	}
	return "Something went wrong. Please try again.";
}

// Your organization's plan (each user has exactly one organization, decision 010). Paying and managing happen
// on Stripe's own pages: the API creates a session, and the browser goes there and comes back to /account.
export function BillingCard({ organizationId }: { organizationId: string }) {
	const queryClient = useQueryClient();
	const billing = useQuery(billingQuery(organizationId));
	const redirect = useMutation({
		mutationFn: (page: "checkout" | "portal") =>
			billingRedirect(organizationId, page),
		// A navigation to stripe.com. The button stays disabled while the page leaves.
		onSuccess: ({ url }) => window.location.assign(url),
	});
	const { reset } = redirect;

	// Back from Stripe with the browser's Back button: the browser may show this page exactly as it left it
	// (the back/forward cache), button still disabled and plan as it was. Re-enable it and ask again.
	useEffect(() => {
		const onPageShow = (event: PageTransitionEvent) => {
			if (!event.persisted) return;
			reset();
			void queryClient.invalidateQueries({
				queryKey: billingQuery(organizationId).queryKey,
			});
		};
		window.addEventListener("pageshow", onPageShow);
		return () => window.removeEventListener("pageshow", onPageShow);
	}, [queryClient, organizationId, reset]);

	// Billing is off on this server (no Stripe settings): no card at all.
	if (billing.data?.enabled === false) return null;

	const subscribed = billing.data?.subscribed;
	const busy = redirect.isPending || redirect.isSuccess;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<h2>Billing</h2>
					{subscribed !== undefined && (
						<Badge variant={subscribed ? "default" : "secondary"}>
							{subscribed ? "Pro" : "Free"}
						</Badge>
					)}
				</CardTitle>
				<CardDescription>
					{subscribed
						? "Change your card, see invoices or cancel on Stripe."
						: "Upgrade to Pro. You pay on Stripe's secure page."}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
				{billing.isPending && (
					<p className="text-sm text-muted-foreground">Loading…</p>
				)}
				{billing.isError && (
					<p className="text-sm text-destructive">
						We couldn't load your plan. Refresh to try again.
					</p>
				)}
				{subscribed === false && (
					<div>
						<Button disabled={busy} onClick={() => redirect.mutate("checkout")}>
							<Sparkles /> {busy ? "Opening Stripe…" : "Upgrade to Pro"}
						</Button>
					</div>
				)}
				{subscribed === true && (
					<div>
						<Button
							variant="outline"
							disabled={busy}
							onClick={() => redirect.mutate("portal")}
						>
							<CreditCard /> {busy ? "Opening Stripe…" : "Manage billing"}
						</Button>
					</div>
				)}
				{redirect.isError && (
					<p className="text-sm text-destructive">
						{errorMessage(redirect.error)}
					</p>
				)}
			</CardContent>
		</Card>
	);
}
