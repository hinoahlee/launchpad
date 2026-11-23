import assert from "node:assert/strict";
import { test } from "node:test";
import { parseReview } from "./review.ts";

test("parses finding lines in the documented format and tolerates list markers", () => {
	const parsed = parseReview(
		[
			"CONFIRMED | apps/api/src/a.ts:12 | no tenant filter | query lacks organizationId",
			"- PLAUSIBLE | b.ts:3 | maybe slow | not measured",
			"STYLE c.tsx:9 naming",
			"some chatter",
		].join("\n"),
	);
	assert.equal(parsed.status, "ok");
	assert.deepEqual(
		parsed.findings.map((f) => [f.kind, f.location]),
		[
			["CONFIRMED", "apps/api/src/a.ts:12"],
			["PLAUSIBLE", "b.ts:3"],
			["STYLE", "c.tsx:9"],
		],
	);
});

test("NO FINDINGS is a clean pass", () => {
	assert.deepEqual(parseReview("NO FINDINGS\n"), {
		status: "ok",
		findings: [],
	});
});

test("output with neither findings nor NO FINDINGS is malformed, never a pass", () => {
	assert.equal(
		parseReview("Agent terminated early due to an API error").status,
		"malformed",
	);
	assert.equal(parseReview("").status, "malformed");
});
