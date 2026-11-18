import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// The SQL files ship inside this package (`files` in package.json). Node finds the package wherever it's
// installed: packages/db in dev and tests (workspace link), node_modules/@launchpad/db in the image
// (`pnpm deploy`). Asked at call time, not from this file's location: the API bundles this code into its
// own dist/, so a path relative to this file would point there instead.
function migrationsFolder(): string {
	return fileURLToPath(
		new URL("migrations", import.meta.resolve("@launchpad/db/package.json")),
	);
}

// Applies every migration not yet recorded in drizzle.__drizzle_migrations, in order, in one transaction:
// either all of them apply or none do. Safe to run again: applied ones are skipped.
export async function runMigrations(databaseUrl: string): Promise<void> {
	// One connection is enough. onnotice: silence Postgres NOTICEs ("schema already exists, skipping").
	const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
	try {
		await migrate(drizzle(client), { migrationsFolder: migrationsFolder() });
	} finally {
		await client.end();
	}
}
