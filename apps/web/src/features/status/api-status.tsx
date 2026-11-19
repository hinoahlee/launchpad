import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "#components/ui/button.tsx";
import { cn } from "#lib/utils.ts";
import { healthQuery, versionQuery } from "./api.ts";

// The three states every view of server data has: loading, error, data.
export function ApiStatus() {
	const queryClient = useQueryClient();
	const health = useQuery(healthQuery);
	const version = useQuery(versionQuery);

	const status = health.isPending
		? "Checking…"
		: health.isError
			? "Unreachable"
			: "OK";

	return (
		<section className="rounded-xl border bg-card p-4 text-card-foreground">
			<div className="flex items-center justify-between gap-4">
				<div>
					<h2 className="font-medium">API</h2>
					<p className="text-sm text-muted-foreground" aria-live="polite">
						{status}
						{version.data && ` · build ${version.data.sha.slice(0, 7)}`}
					</p>
				</div>
				{/* Cache invalidation: mark the cached answer stale so TanStack Query fetches it again, now. */}
				<Button
					variant="outline"
					size="icon"
					aria-label="Check again"
					disabled={health.isFetching}
					onClick={() => queryClient.invalidateQueries(healthQuery)}
				>
					<RefreshCw className={cn(health.isFetching && "animate-spin")} />
				</Button>
			</div>
		</section>
	);
}
