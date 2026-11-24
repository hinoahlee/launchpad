// The feature queue's side effects: git, gh, headless Claude Code runs, the queue file and its log.
import { execFileSync, spawnSync } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { isClean } from "./checks.ts";
import {
	type Change,
	isUsageLimit,
	parseReset,
	type Queue,
	type RunRecord,
} from "./queue-rules.ts";
import { repoRoot, workflowDir } from "./state.ts";

const root = repoRoot;
const dir = workflowDir(root);
const queuePath = path.join(dir, "queue.json");
const MAX_BUFFER = 256 * 1024 * 1024;
const MINUTE = 60_000;

export const sleep = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

export function log(message: string): void {
	const line = `${new Date().toISOString()} ${message}`;
	console.log(line);
	mkdirSync(dir, { recursive: true });
	appendFileSync(path.join(dir, "queue.log"), `${line}\n`);
}

export function git(args: string[]): string {
	return execFileSync("git", args, {
		cwd: root,
		encoding: "utf8",
		maxBuffer: MAX_BUFFER,
	}).trim();
}

// shell: claude and gh may be shims on Windows.
function sh(command: string): { ok: boolean; stdout: string; all: string } {
	const result = spawnSync(command, {
		cwd: root,
		shell: true,
		encoding: "utf8",
		maxBuffer: MAX_BUFFER,
	});
	const stdout = result.stdout ?? "";
	return {
		ok: result.status === 0,
		stdout,
		all: `${stdout}\n${result.stderr ?? ""}`.trim(),
	};
}

export function readQueue(): Queue {
	if (!existsSync(queuePath))
		throw new Error("no .agentic/queue.json: plan one with /roadmap first");
	return JSON.parse(readFileSync(queuePath, "utf8")) as Queue;
}

export function writeQueue(queue: Queue): void {
	writeFileSync(queuePath, `${JSON.stringify(queue, null, "\t")}\n`);
}

export function syncMain(local: boolean): void {
	if (!isClean(root))
		throw new Error(
			"uncommitted changes in the checkout: commit or stash them, then run the queue again",
		);
	git(["switch", "main"]);
	if (!local) git(["pull", "--ff-only"]);
}

// The run record /deliver archived for this slug after `since` (an older attempt's record doesn't count).
export function latestRun(
	slug: string,
	since = 0,
): (RunRecord & { branch?: string }) | undefined {
	const runs = path.join(dir, "runs");
	if (!existsSync(runs)) return undefined;
	const file = readdirSync(runs)
		.filter(
			(name) =>
				name === `${slug}.json` ||
				new RegExp(`^${slug}-\\d+\\.json$`).test(name),
		)
		.map((name) => path.join(runs, name))
		.filter((name) => statSync(name).mtimeMs >= since)
		.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
	return file ? JSON.parse(readFileSync(file, "utf8")) : undefined;
}

export function branchChanges(branch: string): Change[] {
	const range = `origin/main...${branch}`;
	const deleted = new Map(
		git(["diff", "--no-renames", "--numstat", range])
			.split("\n")
			.filter(Boolean)
			.map((line) => {
				const [, removed = "0", file = ""] = line.split("\t");
				return [file, Number(removed) || 0] as const;
			}),
	);
	return git(["diff", "--no-renames", "--name-status", range])
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [status = "", file = ""] = line.split("\t");
			return {
				path: file,
				status: status[0] as Change["status"],
				deletedLines: deleted.get(file) ?? 0,
			};
		});
}

// Runs `/deliver <slug>` in fresh headless sessions until it archives a run record. A usage limit is not a
// failure: wait for the reset and resume (the run's state machine makes that safe).
export async function deliver(
	slug: string,
	since: number,
	options: { model?: string | undefined; allowedTools?: string[] } = {},
): Promise<{ ok: boolean; reason: string }> {
	const model = options.model ? ` --model ${options.model}` : "";
	const tools = options.allowedTools?.length
		? ` --allowedTools ${options.allowedTools.map((rule) => `"${rule}"`).join(" ")}`
		: "";
	let failures = 0;
	for (let attempt = 1; attempt <= 30; attempt++) {
		log(`${slug}: /deliver, attempt ${attempt}`);
		const run = sh(
			`claude -p "/deliver ${slug}" --output-format json --max-turns 200${model}${tools}`,
		);
		let parsed: { is_error?: boolean; subtype?: string; result?: string } = {};
		try {
			parsed = JSON.parse(run.stdout.trim().split("\n").pop() ?? "");
		} catch {
			// not JSON: the CLI failed before the session started
		}
		const text = `${parsed.result ?? ""}\n${run.all.slice(-2000)}`;
		if (run.ok && !parsed.is_error && latestRun(slug, since))
			return { ok: true, reason: "" };
		if (isUsageLimit(text)) {
			const reset = parseReset(text, new Date());
			const wait = reset
				? reset.getTime() - Date.now() + 2 * MINUTE
				: 30 * MINUTE;
			log(
				`${slug}: usage limit, waiting until ${new Date(Date.now() + wait).toLocaleTimeString()}`,
			);
			await sleep(wait);
			continue;
		}
		failures++;
		log(
			`${slug}: session ended without finishing the run (${parsed.subtype ?? "no result"}); resuming`,
		);
		if (failures >= 3)
			return {
				ok: false,
				reason: `3 sessions ended without finishing: ${text.trim().slice(-300)}`,
			};
	}
	return {
		ok: false,
		reason: "gave up after 30 attempts (usage-limit waits included)",
	};
}

export function prState(pr: string): string {
	return sh(`gh pr view ${pr} --json state --jq .state`).stdout.trim();
}

// Waits for the PR's required checks, then squash-merges it.
export async function mergeOnGitHub(
	pr: string,
): Promise<{ ok: boolean; reason: string }> {
	for (let i = 0; i < 20; i++) {
		const checks = sh(`gh pr checks ${pr} --required --watch --interval 30`);
		if (checks.ok) {
			const merge = sh(`gh pr merge ${pr} --squash --delete-branch`);
			return merge.ok
				? { ok: true, reason: "" }
				: { ok: false, reason: `merge failed: ${merge.all.slice(-300)}` };
		}
		if (!/no (required )?checks/i.test(checks.all))
			return { ok: false, reason: `CI failed: ${checks.all.slice(-500)}` };
		await sleep(30_000); // checks not reported yet
	}
	return { ok: false, reason: "CI checks never started" };
}

// --local (testing in a throwaway clone only): squash-merge into the local main and treat it as origin/main.
export function mergeLocally(
	branch: string,
	slug: string,
): { ok: boolean; reason: string } {
	git(["switch", "main"]);
	git(["merge", "--squash", branch]);
	git(["commit", "-m", `feat: ${slug} (queue, local)`]);
	git(["update-ref", "refs/remotes/origin/main", "HEAD"]);
	git(["branch", "-D", branch]);
	return { ok: true, reason: "" };
}
