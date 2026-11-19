import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { PageLayout } from "#components/layout/page-layout.tsx";

// What every route can reach through `context` (e.g. a `loader` prefetching with the query client).
export type RouterContext = { queryClient: QueryClient };

// The root route wraps every page: the layout, with the matched child route rendered at <Outlet />.
export const Route = createRootRouteWithContext<RouterContext>()({
	component: () => (
		<PageLayout>
			<Outlet />
		</PageLayout>
	),
});
