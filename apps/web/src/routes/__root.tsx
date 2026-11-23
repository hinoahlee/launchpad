import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	Link,
	Outlet,
} from "@tanstack/react-router";
import { PageLayout } from "#components/layout/page-layout.tsx";
import { buttonVariants } from "#components/ui/button.tsx";
import { UserMenu } from "#features/auth/components/user-menu.tsx";
import { pageTitle } from "#lib/site/utils.ts";

export type RouterContext = { queryClient: QueryClient };

export const Route = createRootRouteWithContext<RouterContext>()({
	component: () => (
		<PageLayout headerActions={<UserMenu />}>
			<Outlet />
		</PageLayout>
	),
	// The server answers unknown page URLs with index.html (status 200), hence "noindex".
	notFoundComponent: NotFound,
});

// Pages render their own <title>; React 19 hoists it into <head>.
function NotFound() {
	return (
		<div className="flex flex-col items-start gap-4 pt-4 sm:pt-10">
			<title>{pageTitle("Page not found")}</title>
			<meta name="robots" content="noindex" />
			<p className="text-sm font-medium text-muted-foreground">404</p>
			<h1 className="scroll-m-20 text-3xl font-semibold tracking-tight sm:text-4xl">
				Page not found
			</h1>
			<p className="text-muted-foreground">
				The page you're looking for doesn't exist or has moved.
			</p>
			<Link
				to="/"
				data-slot="button"
				className={buttonVariants({ size: "lg" })}
			>
				Back to home
			</Link>
		</div>
	);
}
