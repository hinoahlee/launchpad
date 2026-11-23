import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { runMigrations } from "./migrate.ts";
import { testDatabaseUrl } from "./testing/database.ts";

// Every migration file the package ships, from Drizzle's own index of them.
const journal = JSON.parse(
	readFileSync(
		path.join(import.meta.dirname, "..", "migrations", "meta", "_journal.json"),
		"utf8",
	),
) as { entries: unknown[] };
const shipped = journal.entries.length;

// onnotice: the drop below reports every object it cascades to; that's expected here.
const sql = postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} });
afterAll(() => sql.end());

describe("runMigrations", () => {
	it("reports what it applied: all on an empty database, none on the next run", async () => {
		// Back to an empty database, as on a first deploy. Ends migrated again, so later test files are unaffected.
		await sql.unsafe(
			"drop schema if exists drizzle cascade; drop schema public cascade; create schema public;",
		);

		expect(await runMigrations(testDatabaseUrl())).toEqual({
			applied: shipped,
			total: shipped,
		});
		expect(await runMigrations(testDatabaseUrl())).toEqual({
			applied: 0,
			total: shipped,
		});
	});
});
