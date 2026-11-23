import postgres from "postgres";
import { createDb, type Database } from "../client.ts";
import { runMigrations } from "../migrate.ts";

// compose.dev.yml locally and the CI service container. TEST_DATABASE_URL overrides it.
const DEFAULT_TEST_DATABASE_URL =
	"postgres://launchpad:launchpad@localhost:5433/launchpad_test";

// Tests wipe their database: refuse any name that isn't clearly disposable. `_test`: Vitest. `_e2e`: Playwright.
export function assertDisposable(url: string): string {
	const name = new URL(url).pathname.slice(1);
	if (!/_(test|e2e)$/.test(name)) {
		throw new Error(
			`Refusing to wipe database "${name}": its name must end in _test or _e2e.`,
		);
	}
	return url;
}

export const testDatabaseUrl = (): string =>
	assertDisposable(process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL);

const connect = (url: string) => postgres(url, { max: 1, onnotice: () => {} });

// Once per run: empty, then the committed migrations (exactly the schema `pnpm db:migrate` produces).
export async function resetTestDatabase(
	url = testDatabaseUrl(),
): Promise<void> {
	await emptyDatabase(url);
	await runMigrations(url);
}

// Creates the database if missing, then drops everything in it, migration records included.
export async function emptyDatabase(url: string): Promise<void> {
	assertDisposable(url);
	const name = new URL(url).pathname.slice(1);
	const server = new URL(url);
	server.pathname = "/postgres";
	const admin = connect(server.href);
	try {
		const found =
			await admin`select 1 from pg_database where datname = ${name}`;
		if (found.length === 0) {
			await admin`create database ${admin(name)}`;
		}
	} catch (error) {
		throw new Error(
			`Can't prepare database "${name}" on ${server.host}. Is Postgres running? ` +
				"Start it with: pnpm db:up",
			{ cause: error },
		);
	} finally {
		await admin.end();
	}

	const sql = connect(url);
	try {
		await sql.unsafe(
			"drop schema if exists drizzle cascade; drop schema public cascade; create schema public;",
		);
	} finally {
		await sql.end();
	}
}

// Every table in `public`, read from the catalog, so new tables need no listing here.
export async function truncateAll(url = testDatabaseUrl()): Promise<void> {
	const sql = connect(url);
	try {
		const tables = await sql<{ name: string }[]>`
			select quote_ident(tablename) as name from pg_tables where schemaname = 'public'`;
		if (tables.length > 0) {
			await sql.unsafe(
				`truncate ${tables.map((t) => t.name).join(", ")} restart identity cascade`,
			);
		}
	} finally {
		await sql.end();
	}
}

// Close it in afterAll: `await db.$client.end()`.
export function createTestDb(): Database {
	return createDb(testDatabaseUrl());
}
