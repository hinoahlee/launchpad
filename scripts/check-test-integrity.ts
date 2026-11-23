// `pnpm lint` runs this: compares the branch (committed and uncommitted) with origin/main and fails when a change
// weakens the safety net: focused or skipped tests, lint suppressions, fewer tests, or an edited applied migration.
// Rules and messages: test-integrity.ts.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
	type FileChange,
	findProblems,
	isMigration,
	isTestFile,
	parseAllowlist,
} from "./test-integrity.ts";

const git = (args: string[]) =>
	execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

let base: string;
try {
	base = git(["merge-base", "origin/main", "HEAD"]).trim();
} catch {
	// A shallow CI checkout has no origin/main to compare against.
	console.log("test integrity: skipped (no origin/main to compare against)");
	process.exit(0);
}

const changes = new Map<string, FileChange>();
for (const line of git(["diff", "--no-renames", "--name-status", base])
	.split("\n")
	.filter(Boolean)) {
	const [status = "", file = ""] = line.split("\t");
	changes.set(file, {
		path: file,
		status: status[0] as FileChange["status"],
		addedLines: [],
	});
}
for (const file of git(["ls-files", "--others", "--exclude-standard"])
	.split("\n")
	.filter(Boolean)) {
	const text = readFileSync(file, "utf8");
	changes.set(file, {
		path: file,
		status: "A",
		after: text,
		addedLines: text.split("\n"),
	});
}

let current: FileChange | undefined;
for (const line of git(["diff", "--no-renames", "-U0", base]).split("\n")) {
	if (line.startsWith("+++ ")) current = changes.get(line.slice(6));
	else if (line.startsWith("+") && current)
		current.addedLines.push(line.slice(1));
}

for (const change of changes.values()) {
	if (!isTestFile(change.path) && !isMigration(change.path)) continue;
	if (change.status !== "A")
		change.before = git(["show", `${base}:${change.path}`]);
	if (
		change.status !== "D" &&
		change.after === undefined &&
		existsSync(change.path)
	) {
		change.after = readFileSync(change.path, "utf8");
	}
}

const allowlist = parseAllowlist(git(["log", "--format=%B", `${base}..HEAD`]));
const problems = findProblems([...changes.values()], allowlist);

if (problems.length > 0) {
	console.error(
		`Test integrity problems (compared with origin/main):\n  ${problems.join("\n  ")}`,
	);
	process.exitCode = 1;
} else {
	console.log(`test integrity ok (${changes.size} changed files)`);
}
