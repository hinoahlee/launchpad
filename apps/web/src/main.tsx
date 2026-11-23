import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { ThemeProvider } from "#components/theme/provider.tsx";
import { ApiError } from "#lib/api/errors.ts";
import {
	initSentry,
	reactErrorOptions,
	throwTestErrorIfAsked,
} from "#lib/sentry.ts";
import { config } from "./config.ts";
import { routeTree } from "./routeTree.gen.ts";

initSentry(config);

// 4xx answers aren't retried: a retry won't change them.
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			retry: (failures, error) =>
				!(error instanceof ApiError && error.status < 500) && failures < 2,
		},
	},
});

const router = createRouter({
	routeTree,
	context: { queryClient },
	defaultPreload: "intent",
	scrollRestoration: true,
});

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
