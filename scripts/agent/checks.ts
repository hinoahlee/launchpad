// Running the gates (verify, e2e) and deciding when e2e is needed. Shared by the stop gate and run.ts.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { E2E_COMMAND, E2E_PATHS, VERIFY_COMMAND } from "./project.ts";

export const TAIL_LINES = 40;

export type Check = "verify" | "e2e";
export type CommandResult = { ok: boolean; tail: string };

export const commandFor = (check: Check) =>
	check === "verify" ? VERIFY_COMMAND : E2E_COMMAND;

export function needsE2e(files: string[]): boolean {
	return (
		E2E_COMMAND !== "" &&
		files.some((file) => E2E_PATHS.some((pattern) => pattern.test(file)))
	);
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

const lines = (text: string) => text.split("\n").filter(Boolean);

export function headSha(root: string): string {
	return git(root, ["rev-parse", "HEAD"]).trim();
}

function untracked(root: string): string[] {
	return lines(git(root, ["ls-files", "--others", "--exclude-standard"]));
}

// Files this branch changes compared with main, committed or not.
export function changedFiles(root: string): string[] {
	let committed: string[];
	try {
		committed = lines(
			git(root, ["diff", "--name-only", "--merge-base", "origin/main"]),
		);
	} catch {
		committed = lines(git(root, ["diff", "--name-only", "HEAD"]));
	}
	return [...new Set([...committed, ...untracked(root)])];
}

// Files changed since a commit, committed or not.
export function changedSince(root: string, ref: string): string[] {
	return [
		...new Set([
			...lines(git(root, ["diff", "--name-only", ref])),
			...untracked(root),
		]),
	];
}

export function isClean(root: string): boolean {
	return git(root, ["status", "--porcelain"]).trim() === "";
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

export function runCheck(root: string, check: Check): CommandResult {
	// shell: package managers are .cmd shims on Windows; 2>&1 keeps errors in order with the output in cmd and sh.
	const result = spawnSync(`${commandFor(check)} 2>&1`, {
		cwd: root,
		shell: true,
		encoding: "utf8",
		maxBuffer: 256 * 1024 * 1024,
	});
	const output = `${result.stdout ?? ""}${result.error ? `\n${result.error.message}` : ""}`;
	return { ok: result.status === 0, tail: tail(output) };
}
