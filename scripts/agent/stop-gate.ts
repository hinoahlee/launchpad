// Claude Code's Stop hook (.claude/settings.json): the agent may end its turn only when `pnpm verify` (and, during a
// /deliver run that touched the browser, `pnpm e2e`) passes. Exit 2 sends stderr back to the agent and keeps it
// working; after MAX_STOPS failures in a row it lets the turn end so a stuck run can't burn the usage limit.
// It deliberately ignores `stop_hook_active`: a retry is exactly when the fix must be re-checked, and the counter
// (plus Claude Code's own cap on consecutive blocks) is the brake.
// `--reset` (the UserPromptSubmit hook) zeroes the counter: a person's message starts a new budget.
import {
	changedFiles,
	fingerprint,
	headSha,
	needsE2e,
	runPnpm,
} from "./checks.ts";
import { gate } from "./gate.ts";
import { readState, repoRoot, writeState } from "./state.ts";

const root = repoRoot;
const state = readState(root);

if (process.argv.includes("--reset")) {
	if (state.gate.stops > 0) {
		state.gate.stops = 0;
		writeState(root, state);
	}
} else {
	const result = gate(state, {
		fingerprint: () => fingerprint(root),
		changedFiles: () => changedFiles(root),
		needsE2e,
		run: (script) => runPnpm(root, script),
		sha: () => headSha(root),
		now: () => new Date().toISOString(),
	});
	writeState(root, result.state);
	console.error(result.message);
	process.exitCode = result.exitCode;
}
