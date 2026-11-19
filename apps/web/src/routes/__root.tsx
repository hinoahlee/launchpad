import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	Link,
	Outlet,
} from "@tanstack/react-router";
import { PageLayout } from "#components/layout/page-layout.tsx";
import { Button } from "#components/ui/button.tsx";
import { pageTitle } from "#lib/site.ts";

// What every route can reach through `context` (e.g. a `loader` prefetching with the query client).
export type RouterContext = { queryClient: QueryClient };

// The root route wraps every page: the layout, with the matched child route rendered at <Outlet />.
export const Route = createRootRouteWithContext<RouterContext>()({
	component: () => (
		<PageLayout>
			<Outlet />
		</PageLayout>
	),
	// Any URL no route matches. The server already answers unknown page URLs with index.html (app.ts), so the
	// router decides here. The status is 200, as for every SPA route, so "noindex" keeps it out of search.
	notFoundComponent: NotFound,
});

// Each page renders its own <title> (and <meta>); React 19 moves them into <head>.
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
			<Button size="lg" nativeButton={false} render={<Link to="/" />}>
				Back to home
			</Button>
		</div>
	);
}
