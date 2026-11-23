// The test/implementation boundary, checked on the diff: whatever tool an agent used to write a file, the commit
// history since its handoff shows it. Used by run.ts (`handoff`, `boundary`).
import { changedSince, headSha, isClean } from "./checks.ts";
import { outOfBounds, type Role } from "./files.ts";
import type { RunState } from "./state.ts";

export function startHandoff(
	root: string,
	run: RunState,
	role: string,
): string {
	if (role !== "tests" && role !== "impl")
		throw new Error("usage: handoff <tests|impl>");
	if (!isClean(root)) {
		throw new Error(
			"commit first: a handoff starts from a clean tree, so the boundary check sees only the agent's changes",
		);
	}
	run.handoff = {
		role: role as Role,
		base: headSha(root),
		at: new Date().toISOString(),
	};
	return `handoff to ${role === "tests" ? "test-writer" : "implementer"} from ${run.handoff.base.slice(0, 7)}`;
}

export function checkBoundary(root: string, run: RunState): string {
	if (!run.handoff)
		throw new Error(
			"no handoff recorded: run `handoff <tests|impl>` before spawning the agent",
		);
	const { role, base } = run.handoff;
	const bad = outOfBounds(role, changedSince(root, base));
	if (bad.length > 0) {
		throw new Error(
			`BOUNDARY VIOLATION: the ${role === "tests" ? "test writer changed non-test" : "implementer changed test"} files:\n  ${bad.join("\n  ")}\nRestore them (\`git checkout ${base.slice(0, 7)} -- <file>\`, or delete a new file) and route the need to the other agent.`,
		);
	}
	return `boundary ok (${role})`;
}
