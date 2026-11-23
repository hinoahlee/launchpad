// The rules behind check-test-integrity.ts, as pure functions over a branch's changes (tested on their own).
import { MIGRATION_JOURNAL, MIGRATIONS_DIR } from "./agent/project.ts";

export type FileChange = {
	path: string;
	status: "A" | "M" | "D";
	before?: string; // content on main
	after?: string; // content in the working tree
	addedLines: string[];
};

export type Migrations = { dir: string; journal: string };
const PROJECT_MIGRATIONS: Migrations = {
	dir: MIGRATIONS_DIR,
	journal: MIGRATION_JOURNAL,
};

export const isTestFile = (file: string) =>
	/\.(test|spec)\.[cm]?[jt]sx?$/.test(file);
export const isMigration = (file: string, migrations = PROJECT_MIGRATIONS) =>
	migrations.dir !== "" && file.startsWith(migrations.dir);

// Every test()/it() call, including it.each(...)(...) and test.describe-less forms; good enough to see a drop.
export function countTests(source: string): number {
	return (
		source.match(
			/(?<![\w.$])(?:it|test)(?:\.(?:each|concurrent|sequential|fails|only|skip|todo)\b[^(]*)?\s*\(/g,
		)?.length ?? 0
	);
}

const FOCUS_OR_SKIP =
	/(?<![\w$])(?:describe|it|test)\.(?:only|skip)\s*\(|(?<![\w$])x(?:it|test|describe)\s*\(/;
const SUPPRESSION = /(?:\/\/|\/\*|\{\/\*)\s*biome-ignore/;

// `Tests-changed: <path>: <why>` lines in the branch's commit messages allow a test file to lose tests.
export function parseAllowlist(commitMessages: string): Set<string> {
	const paths = [
		...commitMessages.matchAll(/^Tests-changed:\s*([^\s:]+)/gm),
	].map((match) => match[1] ?? "");
	return new Set(paths.filter(Boolean));
}

function journalOnlyAppends(before: string, after: string): boolean {
	try {
		const old = JSON.parse(before).entries as unknown[];
		const next = JSON.parse(after).entries as unknown[];
		return old.every(
			(entry, i) => JSON.stringify(entry) === JSON.stringify(next[i]),
		);
	} catch {
		return false;
	}
}

export function findProblems(
	changes: FileChange[],
	allowlist: Set<string>,
	migrations = PROJECT_MIGRATIONS,
): string[] {
	const problems: string[] = [];
	for (const change of changes) {
		const { path, status } = change;

		if (isTestFile(path)) {
			for (const line of change.addedLines) {
				if (FOCUS_OR_SKIP.test(line)) {
					problems.push(
						`${path}: adds \`${line.trim()}\`. A focused test hides every other test and a skipped one silently stops running. Remove it; if the test is obsolete, delete it and explain why in a commit trailer \`Tests-changed: ${path}: <why>\`.`,
					);
				}
			}
			const before = countTests(change.before ?? "");
			const after = countTests(change.after ?? "");
			if (status !== "A" && after < before && !allowlist.has(path)) {
				problems.push(
					`${path}: ${before} → ${after} tests. Restore the removed tests. If removing them is right, add a commit trailer \`Tests-changed: ${path}: <why>\` (the PR body lists it for review).`,
				);
			}
		}

		if (/\.(ts|tsx|js|mjs|json|jsonc|css)$/.test(path)) {
			for (const line of change.addedLines) {
				if (SUPPRESSION.test(line)) {
					problems.push(
						`${path}: adds a biome-ignore suppression (\`${line.trim()}\`). Fix the code instead; if the rule is wrong for the whole repo, change biome.json in its own PR.`,
					);
				}
			}
		}

		if (isMigration(path, migrations) && status !== "A") {
			if (
				path === migrations.journal &&
				status === "M" &&
				journalOnlyAppends(change.before ?? "", change.after ?? "")
			)
				continue;
			problems.push(
				`${path}: edits a migration that is already on main (${status === "D" ? "deleted" : "modified"}). Applied migrations never change: restore it with \`git checkout origin/main -- ${path}\` and put the change in a new migration.`,
			);
		}
	}
	return problems;
}
