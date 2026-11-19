import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { ThemeProvider } from "./components/theme-provider.tsx";
import { config } from "./config.ts";
import { ApiError } from "./lib/api.ts";
import {
	initSentry,
	reactErrorOptions,
	throwTestErrorIfAsked,
} from "./lib/sentry.ts";
import { routeTree } from "./routeTree.gen.ts";

// First, so errors during startup are reported too.
initSentry(config);

// Server state: data owned by the API, cached here. Fresh for 30 s (a second component asking for it gets the
// cached copy, no request). Failures retry twice, except 4xx answers, which a retry won't change.
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			retry: (failures, error) =>
				!(error instanceof ApiError && error.status < 500) && failures < 2,
		},
	},
});

// Client-side routing: a link changes the URL and renders the matching route, without reloading the page.
const router = createRouter({
	routeTree,
	context: { queryClient },
	// Start loading a route's code when its link is hovered or focused, so the click feels instant.
	defaultPreload: "intent",
	scrollRestoration: true,
});

// Makes <Link to="..."> and navigate() type-checked against the real routes.
declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing #root");

createRoot(root, reactErrorOptions).render(
	<StrictMode>
		<ThemeProvider>
			<QueryClientProvider client={queryClient}>
				<RouterProvider router={router} />
			</QueryClientProvider>
		</ThemeProvider>
	</StrictMode>,
);

throwTestErrorIfAsked();
