// Delivers the specs in .agentic/queue.json (written by /roadmap) one after another, unattended:
//   for each item: sync main → `claude -p "/deliver <slug>"` → decide (queue-rules.ts) → wait for CI → merge → next.
// A run that needs judgment (findings left, a dispute, changed tests, a sensitive path, a failure) stops the queue
// with the reason; merge or fix it yourself, then start the queue again. It also stops after `pauseEvery` merges.
// Usage: node scripts/agent/queue.ts [--local]
//   --local: in a throwaway clone with no real remote; merges into the local main instead of GitHub.
import { readFileSync } from "node:fs";
import path from "node:path";
import {
	branchChanges,
	deliver,
	git,
	latestRun,
	log,
	mergeLocally,
	mergeOnGitHub,
	prState,
	readQueue,
	syncMain,
	writeQueue,
} from "./queue-io.ts";
import { mergeDecision, nextItem, type Queue } from "./queue-rules.ts";
import { repoRoot } from "./state.ts";

const local = process.argv.includes("--local");
let queue: Queue;

// A throwaway clone is a folder Claude Code hasn't been told to trust, so it ignores the project's allow list:
// --local passes the same list explicitly.
function projectAllowList(): string[] {
	const settings = JSON.parse(
		readFileSync(path.join(repoRoot, ".claude", "settings.json"), "utf8"),
	);
	return settings.permissions?.allow ?? [];
}

function stop(message: string, exitCode = 1): never {
	writeQueue(queue);
	log(exitCode === 0 ? message : `STOPPED: ${message}`);
	process.exit(exitCode);
}

try {
	queue = readQueue();
	if (
		local &&
		/^(https?:|git@|ssh:)/.test(git(["remote", "get-url", "--push", "origin"]))
	) {
		throw new Error(
			"--local merges into main and rewrites origin/main: only in a clone without a real remote",
		);
	}
} catch (error) {
	console.error((error as Error).message);
	process.exit(1);
}

let merged = 0;
for (;;) {
	const item = nextItem(queue);
	if (!item) stop(`queue finished: ${queue.items.length} items merged`, 0);

	if (item.status === "waiting") {
		if (local || !item.pr || prState(item.pr) !== "MERGED") {
			stop(
				`${item.slug} is waiting for you: ${item.note ?? ""}${item.pr ? ` (${item.pr})` : ""}`,
			);
		}
		item.status = "merged";
		log(`${item.slug}: merged by you, continuing`);
		writeQueue(queue);
		syncMain(local);
		continue;
	}
	if (merged >= queue.pauseEvery)
		stop(
			`checkpoint: ${merged} merged. Look at main, then run the queue again.`,
			0,
		);

	if (item.status === "pending") {
		syncMain(local);
		item.startedAt = Date.now();
	}
	item.status = "running";
	writeQueue(queue);

	const result = await deliver(item.slug, item.startedAt ?? 0, {
		model: queue.model,
		...(local ? { allowedTools: projectAllowList() } : {}),
	});
	if (!result.ok) {
		item.status = "stopped";
		item.note = result.reason;
		stop(`${item.slug}: ${result.reason}`);
	}

	const run = latestRun(item.slug, item.startedAt ?? 0) ?? {};
	const branch = (run as { branch?: string }).branch;
	item.pr =
		run.outcome === "pr-opened" && run.note?.startsWith("http")
			? run.note
			: undefined;
	const decision = mergeDecision(run, branch ? branchChanges(branch) : []);
	if (!decision.auto) {
		item.status = run.outcome === "pr-opened" ? "waiting" : "stopped";
		item.note = decision.reasons.join("; ");
		stop(
			`${item.slug} needs you: ${item.note}${item.pr ? ` (${item.pr})` : ""}`,
		);
	}

	log(`${item.slug}: clean run, merging`);
	const merge =
		local && branch
			? mergeLocally(branch, item.slug)
			: item.pr
				? await mergeOnGitHub(item.pr)
				: { ok: false, reason: "no PR URL in the run record" };
	if (!merge.ok) {
		item.status = "waiting";
		item.note = merge.reason;
		stop(`${item.slug}: ${merge.reason}`);
	}
	item.status = "merged";
	merged++;
	log(`${item.slug}: merged (${merged} this session)`);
	writeQueue(queue);
	syncMain(local);
}
