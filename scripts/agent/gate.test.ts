import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { type GateDeps, gate } from "./gate.ts";
import { freshState, MAX_STOPS, type RunState } from "./state.ts";

function deps(
	overrides: Partial<GateDeps> & { results?: Record<string, boolean> } = {},
) {
	const ran: string[] = [];
	const value: GateDeps = {
		fingerprint: () => "tree-1",
		changedFiles: () => ["apps/web/src/main.tsx"],
		needsE2e: (files) => files.some((file) => file.startsWith("apps/web/")),
		run: (script) => {
			ran.push(script);
			return {
				ok: overrides.results?.[script] ?? true,
				tail: `${script} output`,
			};
		},
		sha: () => "abc",
		now: () => "2026-01-01T00:00:00Z",
		...overrides,
	};
	return { value, ran };
}

const activeRun = (): RunState => ({
	...freshState(),
	slug: "x",
	phase: "implement",
});

describe("gate", () => {
	test("green verify lets the turn end and resets the counter", () => {
		const { value, ran } = deps();
		const state = freshState();
		state.gate.stops = 3;
		const result = gate(state, value);
		assert.equal(result.exitCode, 0);
		assert.equal(result.state.gate.stops, 0);
		assert.deepEqual(ran, ["verify"]);
	});

	test("failing verify blocks with the output tail and counts the failure", () => {
		const { value } = deps({ results: { verify: false } });
		const result = gate(freshState(), value);
		assert.equal(result.exitCode, 2);
		assert.match(result.message, /\(1\/5\)[\s\S]*verify output/);
		assert.equal(result.state.gate.stops, 1);
		assert.match(result.state.gate.lastFailure ?? "", /verify output/);
	});

	test("gives up once the cap is reached, without running anything", () => {
		const { value, ran } = deps();
		const state = freshState();
		state.gate.stops = MAX_STOPS;
		const result = gate(state, value);
		assert.equal(result.exitCode, 0);
		assert.match(result.message, /gave up/);
		assert.deepEqual(ran, []);
	});

	test("five failures in a row reach the cap", () => {
		const { value } = deps({ results: { verify: false } });
		let state = freshState();
		const codes: number[] = [];
		for (let i = 0; i < MAX_STOPS + 1; i++) {
			const result = gate(state, value);
			codes.push(result.exitCode);
			state = result.state;
		}
		assert.deepEqual(codes, [2, 2, 2, 2, 2, 0]);
	});

	test("does not re-run verify on an unchanged green tree", () => {
		const { value, ran } = deps();
		const state = freshState();
		state.gate.greenFingerprint = "tree-1";
		assert.equal(gate(state, value).exitCode, 0);
		assert.deepEqual(ran, []);
	});

	test("runs e2e only during a run that touched the browser", () => {
		const outside = deps();
		gate(freshState(), outside.value);
		assert.deepEqual(outside.ran, ["verify"]);

		const inside = deps();
		gate(activeRun(), inside.value);
		assert.deepEqual(inside.ran, ["verify", "e2e"]);

		const apiOnly = deps({
			changedFiles: () => ["apps/api/src/features/greeting/routes.ts"],
		});
		gate(activeRun(), apiOnly.value);
		assert.deepEqual(apiOnly.ran, ["verify"]);
	});

	test("a failing e2e blocks", () => {
		const { value } = deps({ results: { e2e: false } });
		const result = gate(activeRun(), value);
		assert.equal(result.exitCode, 2);
		assert.match(result.message, /failed \(1\/5\)[\s\S]*e2e output/);
		assert.equal(result.state.gate.greenFingerprint, "tree-1");
	});
});
