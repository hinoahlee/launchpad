import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Applies every migration in `migrationsFolder` not yet recorded in drizzle.__drizzle_migrations, in order,
// in one transaction: either all of them apply or none do. Safe to run again: applied ones are skipped.
export async function runMigrations(
	databaseUrl: string,
	migrationsFolder: string,
): Promise<void> {
	// One connection is enough. onnotice: silence Postgres NOTICEs ("schema already exists, skipping").
	const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
	try {
		await migrate(drizzle(client), { migrationsFolder });
	} finally {
		await client.end();
	}
}
