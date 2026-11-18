import { createRequire } from "node:module";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// The SQL files ship inside this package (`files` in package.json). Node finds the package wherever it's
// installed: packages/db in dev and tests (workspace link), node_modules/@launchpad/db in the image
// (`pnpm deploy`). Asked at call time, not from this file's location: the API bundles this code into its
// own dist/, so a path relative to this file would point there instead.
// require.resolve, not import.meta.resolve: same lookup, but Vitest's module runner doesn't support the latter.
function migrationsFolder(): string {
	const require = createRequire(import.meta.url);
	return path.join(
		path.dirname(require.resolve("@launchpad/db/package.json")),
		"migrations",
	);
}

// Migrations recorded as applied. 0 on a fresh database, where Drizzle hasn't created its table yet. Two
// queries: Postgres resolves every table a query names before running it, so one query can't skip a missing one.
async function appliedCount(client: postgres.Sql): Promise<number> {
	const [table] = await client<{ exists: boolean }[]>`
		select to_regclass('drizzle.__drizzle_migrations') is not null as exists`;
	if (!table?.exists) return 0;
	const [row] = await client<{ n: number }[]>`
		select count(*)::int as n from drizzle.__drizzle_migrations`;
	return row?.n ?? 0;
}

export type MigrationResult = {
	// Migrations this run applied (0: the database was already up to date).
	applied: number;
	// Migrations recorded in the database after this run.
	total: number;
};

// Applies every migration not yet recorded in drizzle.__drizzle_migrations, in order, in one transaction:
// either all of them apply or none do. Safe to run again: applied ones are skipped.
export async function runMigrations(
	databaseUrl: string,
): Promise<MigrationResult> {
	// One connection is enough. onnotice: silence Postgres NOTICEs ("schema already exists, skipping").
	const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
	try {
		const before = await appliedCount(client);
		await migrate(drizzle(client), { migrationsFolder: migrationsFolder() });
		const total = await appliedCount(client);
		return { applied: total - before, total };
	} finally {
		await client.end();
	}
}
