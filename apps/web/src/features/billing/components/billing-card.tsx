import { ENTITLEMENTS } from "@launchpad/shared";
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
import { ApiError } from "#lib/api/errors.ts";
import { billingQuery, billingRedirect, syncBilling } from "../api.ts";

function storage(bytes: number): string {
	const gb = bytes / 1024 ** 3;
	return gb >= 1 ? `${gb} GB` : `${bytes / 1024 ** 2} MB`;
}

const FREE_STORAGE = storage(ENTITLEMENTS.free.storageQuotaBytes);
const PRO_STORAGE = storage(ENTITLEMENTS.pro.storageQuotaBytes);

// What the plan gives, and what to do next. `subscribed` without "pro": a payment that didn't go through.
function description(subscribed: boolean, pro: boolean): string {
	if (pro) {
		return `${PRO_STORAGE} of storage. Change your card, see invoices or cancel on Stripe.`;
	}
	if (subscribed) {
		return `Your payment didn't go through, so you're on Free (${FREE_STORAGE} of storage). Update your card on Stripe.`;
	}
	return `${FREE_STORAGE} of storage. Upgrade to Pro for ${PRO_STORAGE}. You pay on Stripe's secure page.`;
}

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

// Paying happens on Stripe pages, which send the browser back to /account?billing=... (`returnedFromStripe`):
// the card then syncs at once (webhooks lag a moment) and calls `onReturnHandled` to drop the marker.
export function BillingCard({
	organizationId,
	returnedFromStripe,
	onReturnHandled,
}: {
	organizationId: string;
	returnedFromStripe: boolean;
	onReturnHandled: () => void;
}) {
	const queryClient = useQueryClient();
	const billing = useQuery(billingQuery(organizationId));
	const { mutate: sync } = useMutation({
		mutationFn: () => syncBilling(organizationId),
		onSuccess: (data) =>
			queryClient.setQueryData(billingQuery(organizationId).queryKey, data),
	});
	useEffect(() => {
		if (!returnedFromStripe) return;
		sync();
		onReturnHandled();
	}, [returnedFromStripe, sync, onReturnHandled]);
	const redirect = useMutation({
		mutationFn: (page: "checkout" | "portal") =>
			billingRedirect(organizationId, page),
		onSuccess: ({ url }) => window.location.assign(url),
	});
	const { reset } = redirect;

	// Back button from Stripe: the back/forward cache restores this page as it left, button disabled.
	useEffect(() => {
		const onPageShow = (event: PageTransitionEvent) => {
			if (!event.persisted) return;
			reset();
			sync();
		};
		window.addEventListener("pageshow", onPageShow);
		return () => window.removeEventListener("pageshow", onPageShow);
	}, [reset, sync]);

	if (billing.data?.enabled === false) return null;

	const subscribed = billing.data?.subscribed;
	const pro = billing.data?.plan === "pro";
	const busy = redirect.isPending || redirect.isSuccess;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<h2>Billing</h2>
					{billing.data && (
						<Badge variant={pro ? "default" : "secondary"}>
							{pro ? "Pro" : "Free"}
						</Badge>
					)}
				</CardTitle>
				{billing.data && (
					<CardDescription>
						{description(billing.data.subscribed, pro)}
					</CardDescription>
				)}
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
