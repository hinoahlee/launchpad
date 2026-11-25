// Which changed files are applied migrations that must not change (used by check-applied-migrations.ts).
export type Migrations = { dir: string; journal: string };

export const PROJECT_MIGRATIONS: Migrations = {
	dir: "packages/db/migrations/",
	// The one file in `dir` that may grow by appending entries (drizzle-kit's journal).
	journal: "packages/db/migrations/meta/_journal.json",
};

export function isMigration(
	file: string,
	migrations = PROJECT_MIGRATIONS,
): boolean {
	return file.startsWith(migrations.dir);
}

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
