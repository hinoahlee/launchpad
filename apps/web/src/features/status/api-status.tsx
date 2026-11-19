import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "#components/ui/button.tsx";
import {
	Card,
	CardAction,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#components/ui/card.tsx";
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
		<Card>
			<CardHeader>
				<CardTitle>API</CardTitle>
				<CardDescription aria-live="polite">
					{status}
					{version.data && ` · build ${version.data.sha.slice(0, 7)}`}
				</CardDescription>
				<CardAction>
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
				</CardAction>
			</CardHeader>
		</Card>
	);
}
