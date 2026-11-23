// Running the gates (pnpm verify, pnpm e2e) and deciding when e2e is needed. Shared by the stop gate and run.ts.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export const TAIL_LINES = 40;

// Changes here can break something only a browser sees: pages, auth, files, the CSP and other HTTP headers.
const E2E_PATHS = [
	/^apps\/web\//,
	/^apps\/api\/src\/http\//,
	/^apps\/api\/src\/(features|lib)\/(auth|files|storage)\//,
	/^e2e\//,
	/^packages\/shared\/src\/schemas\/(auth|files)/,
];

export function needsE2e(files: string[]): boolean {
	return files.some((file) => E2E_PATHS.some((pattern) => pattern.test(file)));
}

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

export function tail(output: string, lines = TAIL_LINES): string {
	return output
		.replace(ANSI, "")
		.split(/\r?\n/)
		.filter((line) => line.trim() !== "")
		.slice(-lines)
		.join("\n");
}

function git(root: string, args: string[]): string {
	return execFileSync("git", args, {
		cwd: root,
		encoding: "utf8",
		maxBuffer: 256 * 1024 * 1024,
	});
}

export function headSha(root: string): string {
	return git(root, ["rev-parse", "HEAD"]).trim();
}

function untracked(root: string): string[] {
	return git(root, ["ls-files", "--others", "--exclude-standard"])
		.split("\n")
		.filter(Boolean);
}

// Files this branch changes compared with main, committed or not.
export function changedFiles(root: string): string[] {
	let committed: string[] = [];
	try {
		committed = git(root, [
			"diff",
			"--name-only",
			"--merge-base",
			"origin/main",
		])
			.split("\n")
			.filter(Boolean);
	} catch {
		committed = git(root, ["diff", "--name-only", "HEAD"])
			.split("\n")
			.filter(Boolean);
	}
	return [...new Set([...committed, ...untracked(root)])];
}

// Identifies the exact code being checked (commit + uncommitted edits), so an unchanged tree isn't re-verified.
export function fingerprint(root: string): string {
	const hash = createHash("sha1");
	hash.update(headSha(root));
	hash.update(git(root, ["diff", "HEAD", "--binary"]));
	for (const file of untracked(root)) {
		hash.update(file);
		try {
			hash.update(readFileSync(path.join(root, file)));
		} catch {
			// removed between listing and reading
		}
	}
	return hash.digest("hex");
}

export type CommandResult = { ok: boolean; tail: string };

export function runPnpm(root: string, script: "verify" | "e2e"): CommandResult {
	// shell: pnpm is a .cmd shim on Windows; 2>&1 keeps errors in order with the output in cmd and sh alike.
	const result = spawnSync(`pnpm ${script} 2>&1`, {
		cwd: root,
		shell: true,
		encoding: "utf8",
		maxBuffer: 256 * 1024 * 1024,
	});
	const output = `${result.stdout ?? ""}${result.error ? `\n${result.error.message}` : ""}`;
	return { ok: result.status === 0, tail: tail(output) };
}
