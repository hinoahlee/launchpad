import {
	createDb,
	type Database,
	type NewUser,
	runMigrations,
	type User,
	users,
} from "@launchpad/db";
import postgres from "postgres";

// Test-only helpers, imported as `@launchpad/db/testing`. App code never imports them, so they're never in
// the production bundle.

// compose.dev.yml's Postgres. CI runs the same server as a service container on the same port, so this
// default works in both; set TEST_DATABASE_URL to use another server.
const DEFAULT_TEST_DATABASE_URL =
	"postgres://launchpad:launchpad@localhost:5433/launchpad_test";

// Tests delete everything in this database, so refuse any name that isn't clearly a test database: a stray
// TEST_DATABASE_URL pointing at real data fails here instead of wiping it.
export function testDatabaseUrl(): string {
	const url = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
	const name = new URL(url).pathname.slice(1);
	if (!name.endsWith("_test")) {
		throw new Error(
			`Refusing to run tests against database "${name}": its name must end in _test.`,
		);
	}
	return url;
}

const connect = (url: string) => postgres(url, { max: 1, onnotice: () => {} });

// Once per test run: create the database if it's missing, drop everything in it, then apply the committed
// migrations, so tests see exactly the schema `pnpm db:migrate` produces.
export async function resetTestDatabase(
	url = testDatabaseUrl(),
): Promise<void> {
	const name = new URL(url).pathname.slice(1);
	// CREATE DATABASE runs from another database on the same server: `postgres` always exists.
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
			`Can't prepare the test database on ${server.host}. Is Postgres running? ` +
				"Start it with: pnpm db:up",
			{ cause: error },
		);
	} finally {
		await admin.end();
	}

	const sql = connect(url);
	try {
		// `drizzle` holds the record of applied migrations; dropping it makes them all run again.
		await sql.unsafe(
			"drop schema if exists drizzle cascade; drop schema public cascade; create schema public;",
		);
	} finally {
		await sql.end();
	}
	await runMigrations(url);
}

// Before each test: empty every table in `public`. Read from the catalog, so new tables are covered without
// listing them here. CASCADE follows foreign keys; RESTART IDENTITY resets serial counters.
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

// A client for the test database. Close it in afterAll: `await db.$client.end()`.
export function createTestDb(): Database {
	return createDb(testDatabaseUrl());
}

// Factory: a valid user with unique defaults. Pass only the fields a test is about.
let sequence = 0;
export async function insertUser(
	db: Database,
	overrides: Partial<NewUser> = {},
): Promise<User> {
	sequence += 1;
	const [user] = await db
		.insert(users)
		.values({
			email: `user${sequence}@example.test`,
			name: `User ${sequence}`,
			...overrides,
		})
		.returning();
	if (!user) throw new Error("insert returned no row");
	return user;
}
