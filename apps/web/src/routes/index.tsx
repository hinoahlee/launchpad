import { createFileRoute } from "@tanstack/react-router";
import { ApiStatus } from "#features/status/api-status.tsx";

// The file's path is the URL: routes/index.tsx → "/". Vite regenerates src/routeTree.gen.ts from this folder.
export const Route = createFileRoute("/")({
	component: Home,
});

function Home() {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<h1 className="text-3xl font-semibold tracking-tight">launchpad</h1>
				<p className="text-muted-foreground">
					A production-grade app template. This page is the web shell: routing,
					server data, theme and layout.
				</p>
			</div>
			<ApiStatus />
		</div>
	);
}
