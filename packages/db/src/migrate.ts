import { createRequire } from "node:module";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Resolved at call time, not from this file: the API bundles this code into its own dist/. require.resolve,
// because Vitest doesn't support import.meta.resolve.
function migrationsFolder(): string {
	const require = createRequire(import.meta.url);
	return path.join(
		path.dirname(require.resolve("@launchpad/db/package.json")),
		"migrations",
	);
}

// Two queries: Postgres resolves every table a query names, so one query can't skip a missing one.
async function appliedCount(client: postgres.Sql): Promise<number> {
	const [table] = await client<{ exists: boolean }[]>`
		select to_regclass('drizzle.__drizzle_migrations') is not null as exists`;
	if (!table?.exists) return 0;
	const [row] = await client<{ n: number }[]>`
		select count(*)::int as n from drizzle.__drizzle_migrations`;
	return row?.n ?? 0;
}

type MigrationResult = {
	applied: number;
	total: number;
};

// All pending migrations in one transaction: all apply or none do.
export async function runMigrations(
	databaseUrl: string,
): Promise<MigrationResult> {
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
