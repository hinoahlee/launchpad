import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
	countTests,
	type FileChange,
	findProblems,
	parseAllowlist,
} from "./test-integrity.ts";

// Built from parts so this file's own added lines don't trip the check it tests.
const ONLY = ["it", "only"].join(".");
const SKIP = ["test", "skip"].join(".");
const IGNORE = ["// biome", "ignore lint/suspicious/noExplicitAny: x"].join(
	"-",
);

const change = (
	overrides: Partial<FileChange> & Pick<FileChange, "path">,
): FileChange => ({
	status: "M",
	addedLines: [],
	...overrides,
});

describe("countTests", () => {
	test("counts it, test and their modifiers, not lookalikes", () => {
		const source = `it("a", f); test("b", f); it.each([1])("c", f); ${SKIP}("d", f); myTest("e"); x.test("f"); describe("g", f)`;
		assert.equal(countTests(source), 4);
	});
});

describe("findProblems", () => {
	test("flags a focused or skipped test added to a test file", () => {
		const problems = findProblems(
			[
				change({
					path: "a.test.ts",
					addedLines: [
						`${ONLY}("x", f)`,
						`${SKIP}("y", f)`,
						`x${"it"}("z", f)`,
					],
				}),
			],
			new Set(),
		);
		assert.equal(problems.length, 3);
		assert.match(problems[0] ?? "", /Remove it/);
	});

	test("ignores .only outside test files", () => {
		assert.deepEqual(
			findProblems(
				[change({ path: "a.ts", addedLines: [`${ONLY}("x")`] })],
				new Set(),
			),
			[],
		);
	});

	test("flags an added lint suppression in code, not in prose", () => {
		const code = change({ path: "a.ts", addedLines: [IGNORE] });
		const prose = change({
			path: "a.ts",
			addedLines: ["// never add a biome-ignore here"],
		});
		assert.equal(findProblems([code], new Set()).length, 1);
		assert.deepEqual(findProblems([prose], new Set()), []);
	});

	test("flags fewer tests unless the file is allowlisted", () => {
		const fewer = change({
			path: "a.test.ts",
			before: 'it("a"); it("b")',
			after: 'it("a")',
		});
		assert.match(findProblems([fewer], new Set())[0] ?? "", /2 → 1 tests/);
		assert.deepEqual(findProblems([fewer], new Set(["a.test.ts"])), []);
	});

	test("flags a deleted test file", () => {
		const deleted = change({
			path: "a.test.ts",
			status: "D",
			before: 'it("a")',
		});
		assert.equal(findProblems([deleted], new Set()).length, 1);
	});

	test("allows more tests and new test files", () => {
		const more = change({
			path: "a.test.ts",
			before: 'it("a")',
			after: 'it("a"); it("b")',
		});
		const added = change({ path: "b.test.ts", status: "A", after: 'it("a")' });
		assert.deepEqual(findProblems([more, added], new Set()), []);
	});

	test("flags edits to applied migrations but allows new ones", () => {
		const edited = change({ path: "packages/db/migrations/0001_initial.sql" });
		const added = change({
			path: "packages/db/migrations/0002_notes.sql",
			status: "A",
		});
		assert.match(findProblems([edited], new Set())[0] ?? "", /db:generate/);
		assert.deepEqual(findProblems([added], new Set()), []);
	});

	test("allows appending to the migration journal, not rewriting it", () => {
		const path = "packages/db/migrations/meta/_journal.json";
		const before = JSON.stringify({ entries: [{ idx: 0 }] });
		const appended = change({
			path,
			before,
			after: JSON.stringify({ entries: [{ idx: 0 }, { idx: 1 }] }),
		});
		const rewritten = change({
			path,
			before,
			after: JSON.stringify({ entries: [{ idx: 9 }] }),
		});
		assert.deepEqual(findProblems([appended], new Set()), []);
		assert.equal(findProblems([rewritten], new Set()).length, 1);
	});
});

describe("parseAllowlist", () => {
	test("reads Tests-changed trailers from commit messages", () => {
		const log =
			"feat: x\n\nTests-changed: apps/a.test.ts: merged into b\nother: line\nTests-changed: e2e/c.spec.ts: obsolete";
		assert.deepEqual(
			[...parseAllowlist(log)],
			["apps/a.test.ts", "e2e/c.spec.ts"],
		);
	});
});
