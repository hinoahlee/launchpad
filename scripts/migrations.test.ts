import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
	editedMigrations,
	isMigration,
	outOfOrderMigrations,
} from "./migrations.ts";

const MIGRATIONS = {
	dir: "db/migrations/",
	journal: "db/migrations/meta/_journal.json",
};

describe("isMigration", () => {
	test("only files inside the migrations folder", () => {
		assert.equal(isMigration("db/migrations/0001_a.sql", MIGRATIONS), true);
		assert.equal(isMigration("db/src/schema/users.ts", MIGRATIONS), false);
	});
});

describe("editedMigrations", () => {
	test("flags edited or deleted applied migrations, not new ones", () => {
		const changes = [
			{ path: "db/migrations/0001_initial.sql", status: "M" as const },
			{ path: "db/migrations/0000_citext.sql", status: "D" as const },
			{ path: "db/migrations/0002_notes.sql", status: "A" as const },
			{ path: "src/a.ts", status: "M" as const },
		];
		assert.deepEqual(editedMigrations(changes, MIGRATIONS), [
			"db/migrations/0001_initial.sql",
			"db/migrations/0000_citext.sql",
		]);
	});

	test("allows appending to the journal, not rewriting it", () => {
		const path = MIGRATIONS.journal;
		const before = JSON.stringify({ entries: [{ idx: 0 }] });
		const appended = {
			path,
			status: "M" as const,
			before,
			after: JSON.stringify({ entries: [{ idx: 0 }, { idx: 1 }] }),
		};
		const rewritten = {
			path,
			status: "M" as const,
			before,
			after: JSON.stringify({ entries: [{ idx: 9 }] }),
		};
		assert.deepEqual(editedMigrations([appended], MIGRATIONS), []);
		assert.deepEqual(editedMigrations([rewritten], MIGRATIONS), [path]);
	});
});

describe("outOfOrderMigrations", () => {
	const journal = (...whens: number[]) =>
		JSON.stringify({
			entries: whens.map((when, idx) => ({ idx, when, tag: `000${idx}_m` })),
		});

	test("accepts entries in time order", () => {
		assert.deepEqual(outOfOrderMigrations(journal(1, 2, 3)), []);
	});

	test("flags an entry not newer than the one before it", () => {
		assert.deepEqual(outOfOrderMigrations(journal(1, 3, 2)), ["0002_m"]);
		assert.deepEqual(outOfOrderMigrations(journal(1, 1)), ["0001_m"]);
	});
});
