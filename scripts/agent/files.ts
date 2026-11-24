// Which side of the test/implementation boundary a file is on, and which files are migrations.
import { MIGRATION_JOURNAL, MIGRATIONS_DIR, TEST_PATHS } from "./project.ts";

export type Role = "tests" | "impl";
export type Migrations = { dir: string; journal: string };

export const PROJECT_MIGRATIONS: Migrations = {
	dir: MIGRATIONS_DIR,
	journal: MIGRATION_JOURNAL,
};

export function isTestFile(
	file: string,
	testPaths: RegExp[] = TEST_PATHS,
): boolean {
	return (
		/\.(test|spec)\.[cm]?[jt]sx?$/.test(file) ||
		testPaths.some((pattern) => pattern.test(file))
	);
}

export function isMigration(
	file: string,
	migrations = PROJECT_MIGRATIONS,
): boolean {
	return migrations.dir !== "" && file.startsWith(migrations.dir);
}

// Files a role may not change: the test writer only tests, the implementer never tests. Run state is either's.
export function outOfBounds(
	role: Role,
	files: string[],
	testPaths: RegExp[] = TEST_PATHS,
): string[] {
	return files.filter(
		(file) =>
			!file.startsWith(".agentic/") &&
			(role === "tests") !== isTestFile(file, testPaths),
	);
}

// Applied migrations, except the journal growing by appended entries, must not change.
export function editedMigrations(
	changes: {
		path: string;
		status: "A" | "M" | "D";
		before?: string | undefined;
		after?: string | undefined;
	}[],
	migrations = PROJECT_MIGRATIONS,
): string[] {
	return changes
		.filter((c) => isMigration(c.path, migrations) && c.status !== "A")
		.filter(
			(c) =>
				!(
					c.path === migrations.journal &&
					c.status === "M" &&
					onlyAppends(c.before, c.after)
				),
		)
		.map((c) => c.path);
}

function onlyAppends(before = "", after = ""): boolean {
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
