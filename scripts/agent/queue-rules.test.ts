import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
	type Change,
	isUsageLimit,
	mergeDecision,
	nextItem,
	parseReset,
	type RunRecord,
} from "./queue-rules.ts";

// Explicit, so these tests pass whatever scripts/agent/project.ts says.
const HUMAN = [/^db\/migrations\//, /(^|\/)package\.json$/];
const TESTS = [/^e2e\//];
const clean: RunRecord = {
	outcome: "pr-opened",
	note: "https://x/pull/1",
	reviews: [{ round: 1, status: "ok", confirmed: 0 }],
};
const code: Change[] = [
	{ path: "src/notes/routes.ts", status: "A" },
	{ path: "src/notes/routes.test.ts", status: "A" },
];
const decide = (run: RunRecord, changes: Change[] = code) =>
	mergeDecision(run, changes, HUMAN, TESTS);

describe("mergeDecision", () => {
	test("a clean run with new code and new tests merges itself", () => {
		assert.deepEqual(decide(clean), { auto: true, reasons: [] });
	});

	test("a run that gave up never merges", () => {
		assert.match(
			decide({
				...clean,
				outcome: "gave-up",
				note: "spec stale",
			}).reasons.join(),
			/gave up: spec stale/,
		);
	});

	test("leftover CONFIRMED findings, an interrupted last review, or no review stop it", () => {
		const reviews = [
			{ round: 1, status: "ok", confirmed: 2 },
			{ round: 2, status: "ok", confirmed: 1 },
		];
		assert.match(decide({ ...clean, reviews }).reasons.join(), /1 CONFIRMED/);
		assert.match(
			decide({
				...clean,
				reviews: [{ round: 1, status: "interrupted", confirmed: 0 }],
			}).reasons.join(),
			/interrupted/,
		);
		assert.match(decide({ ...clean, reviews: [] }).reasons.join(), /no review/);
	});

	test("a dispute between the builders stops it", () => {
		assert.match(
			decide({
				...clean,
				disputes: ["routes.test.ts: spec backs the test"],
			}).reasons.join(),
			/disputed/,
		);
	});

	test("changing or deleting an existing test stops it; adding one doesn't", () => {
		const edited = {
			path: "src/a.test.ts",
			status: "M" as const,
			deletedLines: 3,
		};
		const appended = {
			path: "src/a.test.ts",
			status: "M" as const,
			deletedLines: 0,
		};
		assert.equal(decide(clean, [...code, edited]).auto, false);
		assert.equal(decide(clean, [...code, appended]).auto, true);
		assert.equal(
			decide(clean, [...code, { path: "e2e/old.ts", status: "D" }]).auto,
			false,
		);
	});

	test("touching a path that needs a person stops it", () => {
		const reasons = decide(clean, [
			...code,
			{ path: "db/migrations/0003_notes.sql", status: "A" },
		]).reasons;
		assert.match(
			reasons.join(),
			/need a person: db\/migrations\/0003_notes\.sql/,
		);
	});
});

describe("nextItem", () => {
	test("skips merged items, returns the first other one", () => {
		const queue = {
			pauseEvery: 3,
			items: [
				{ slug: "a", status: "merged" as const },
				{ slug: "b", status: "waiting" as const },
				{ slug: "c", status: "pending" as const },
			],
		};
		assert.equal(nextItem(queue)?.slug, "b");
		assert.equal(
			nextItem({ pauseEvery: 3, items: [{ slug: "a", status: "merged" }] }),
			undefined,
		);
	});
});

describe("parseReset", () => {
	const now = new Date(2026, 10, 24, 14, 10);
	test("12-hour and 24-hour times, later today", () => {
		assert.equal(
			parseReset("Usage limit reached · limit resets 3:45pm", now)?.getHours(),
			15,
		);
		assert.equal(parseReset("limit resets 17:00", now)?.getHours(), 17);
		assert.equal(parseReset("resets 3pm", now)?.getMinutes(), 0);
	});
	test("a time already past today means tomorrow", () => {
		assert.equal(parseReset("resets 9am", now)?.getDate(), 25);
	});
	test("no time, no answer", () => {
		assert.equal(parseReset("server error", now), undefined);
	});
});

test("isUsageLimit recognises limit messages only", () => {
	assert.equal(isUsageLimit("Claude AI usage limit reached|1764000000"), true);
	assert.equal(isUsageLimit("API Error: Rate limit reached"), true);
	assert.equal(isUsageLimit("Agent terminated: tests failed"), false);
});
