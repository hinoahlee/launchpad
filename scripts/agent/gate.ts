// The stop gate's decision, separate from I/O so it can be tested: may the agent finish its turn?
import type { CommandResult } from "./checks.ts";
import { isRunActive, MAX_STOPS, type RunState } from "./state.ts";

export type GateDeps = {
	fingerprint(): string;
	changedFiles(): string[];
	needsE2e(files: string[]): boolean;
	run(script: "verify" | "e2e"): CommandResult;
	sha(): string;
	now(): string;
};

export type GateResult = { exitCode: 0 | 2; message: string; state: RunState };

export function gate(input: RunState, deps: GateDeps): GateResult {
	const state: RunState = structuredClone(input);
	const g = state.gate;

	if (g.stops >= MAX_STOPS) {
		return {
			exitCode: 0,
			state,
			message: `stop gate: gave up after ${MAX_STOPS} failed checks in a row. The last failure is in .workflow/state.json (gate.lastFailure). A person needs to look; the counter resets on their next message.`,
		};
	}

	const print = deps.fingerprint();
	const checks: ("verify" | "e2e")[] = [];
	if (g.greenFingerprint !== print) checks.push("verify");
	// e2e takes minutes, so it gates only /deliver runs, and only when the change can affect a browser.
	if (
		isRunActive(state) &&
		g.e2eGreenFingerprint !== print &&
		deps.needsE2e(deps.changedFiles())
	) {
		checks.push("e2e");
	}

	for (const script of checks) {
		const result = deps.run(script);
		const record = { ok: result.ok, at: deps.now(), sha: deps.sha() };
		if (script === "verify") g.lastVerify = record;
		else g.lastE2e = record;
		if (!result.ok) {
			g.stops += 1;
			g.verifyFailures += 1;
			g.lastFailure = `pnpm ${script}:\n${result.tail}`;
			return {
				exitCode: 2,
				state,
				message: `stop gate: \`pnpm ${script}\` failed (${g.stops}/${MAX_STOPS}). Fix the cause; never skip, weaken or delete a check or test to get past it.\n${result.tail}`,
			};
		}
		if (script === "verify") g.greenFingerprint = print;
		else g.e2eGreenFingerprint = print;
	}

	g.stops = 0;
	return {
		exitCode: 0,
		state,
		message: checks.length
			? `stop gate: ${checks.join(" + ")} green`
			: "stop gate: unchanged since last green check",
	};
}
