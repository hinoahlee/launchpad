import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { editedMigrations, isTestFile, outOfBounds } from "./files.ts";

// Explicit, so these tests pass in any repo whatever its scripts/agent/project.ts says.
const TEST_PATHS = [/^e2e\//, /\/testing\//];
const MIGRATIONS = {
	dir: "db/migrations/",
	journal: "db/migrations/meta/_journal.json",
};

describe("isTestFile", () => {
	test("test and spec files in any JS/TS flavour, and test-only folders", () => {
		for (const file of [
			"a.test.ts",
			"b.spec.tsx",
			"c.test.mjs",
			"e2e/support/fixtures.ts",
			"src/testing/sign-in.ts",
		]) {
			assert.equal(isTestFile(file, TEST_PATHS), true, file);
		}
		for (const file of ["routes.ts", "testing.ts", "latest.ts"]) {
			assert.equal(isTestFile(file, TEST_PATHS), false, file);
		}
	});
});

describe("outOfBounds", () => {
	const changed = [
		"src/routes.ts",
		"src/routes.test.ts",
		".agentic/state.json",
	];
	test("the test writer may change only tests", () => {
		assert.deepEqual(outOfBounds("tests", changed, TEST_PATHS), [
			"src/routes.ts",
		]);
	});
	test("the implementer may not change tests", () => {
		assert.deepEqual(outOfBounds("impl", changed, TEST_PATHS), [
			"src/routes.test.ts",
		]);
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
