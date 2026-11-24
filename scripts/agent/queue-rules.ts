// The feature queue's decisions, without I/O so they can be tested: which item is next, whether a finished run may
// merge itself, and when a usage limit resets. scripts/agent/queue.ts does the I/O.
import { isTestFile } from "./files.ts";
import { HUMAN_REVIEW_PATHS } from "./project.ts";

export type ItemStatus =
	| "pending"
	| "running"
	| "waiting"
	| "stopped"
	| "merged";
export type QueueItem = {
	slug: string;
	status: ItemStatus;
	pr?: string | undefined;
	note?: string;
	startedAt?: number;
};
export type Queue = { pauseEvery: number; model?: string; items: QueueItem[] };

// deletedLines: lines the branch removed from the file (git numstat); 0 for a file that only gained lines.
export type Change = {
	path: string;
	status: "A" | "M" | "D";
	deletedLines?: number;
};
export type RunRecord = {
	outcome?: string;
	note?: string;
	reviews?: { round: number; status: string; confirmed: number }[];
	disputes?: string[];
};

export function nextItem(queue: Queue): QueueItem | undefined {
	return queue.items.find((item) => item.status !== "merged");
}

// Merge without a person only when nothing about the run needs judgment. Every reason is shown to the person.
export function mergeDecision(
	run: RunRecord,
	changes: Change[],
	humanPaths: RegExp[] = HUMAN_REVIEW_PATHS,
	testPaths?: RegExp[],
): { auto: boolean; reasons: string[] } {
	const reasons: string[] = [];
	if (run.outcome !== "pr-opened")
		reasons.push(`the run gave up: ${run.note ?? "no reason recorded"}`);

	const last = [...(run.reviews ?? [])].sort((a, b) => b.round - a.round)[0];
	if (!last) reasons.push("no review recorded");
	else if (last.status !== "ok")
		reasons.push(`review round ${last.round} was ${last.status}`);
	else if (last.confirmed > 0)
		reasons.push(`${last.confirmed} CONFIRMED review finding(s) left`);

	if (run.disputes?.length)
		reasons.push(`the builders disputed a test: ${run.disputes.join("; ")}`);

	// New tests appended to an existing file are fine; a removed or rewritten line in one is not.
	const touchedTests = changes
		.filter((c) => isTestFile(c.path, testPaths))
		.filter(
			(c) =>
				c.status === "D" || (c.status === "M" && (c.deletedLines ?? 1) > 0),
		)
		.map((c) => c.path);
	if (touchedTests.length)
		reasons.push(`existing tests changed: ${touchedTests.join(", ")}`);

	const sensitive = changes
		.map((c) => c.path)
		.filter((path) => humanPaths.some((pattern) => pattern.test(path)));
	if (sensitive.length)
		reasons.push(
			`touches files that need a person: ${sensitive.slice(0, 5).join(", ")}`,
		);

	return { auto: reasons.length === 0, reasons };
}

// Claude Code reports a usage limit as "... resets 3:45pm" (local time). Returns when to try again, or undefined.
export function parseReset(text: string, now: Date): Date | undefined {
	const match = /resets\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(
		text,
	);
	if (!match) return undefined;
	let hours = Number(match[1]);
	const minutes = Number(match[2] ?? 0);
	const meridiem = match[3]?.toLowerCase();
	if (meridiem === "pm" && hours < 12) hours += 12;
	if (meridiem === "am" && hours === 12) hours = 0;
	if (hours > 23 || minutes > 59) return undefined;
	const reset = new Date(now);
	reset.setHours(hours, minutes, 0, 0);
	if (reset <= now) reset.setDate(reset.getDate() + 1);
	return reset;
}

export const isUsageLimit = (text: string) =>
	/usage limit|rate limit|limit reached|resets\s+\d/i.test(text);
