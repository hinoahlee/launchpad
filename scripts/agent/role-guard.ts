// PreToolUse hook in the test-writer and implementer agents (`role-guard.ts tests|impl`): refuses an edit on the
// other side of the test/implementation boundary, with exit 2 so the agent sees why. It can't see writes made
// through Bash; `run.ts boundary` checks the actual diff afterwards and is the real guarantee.
import { readFileSync } from "node:fs";
import path from "node:path";
import { outOfBounds, type Role } from "./files.ts";
import { repoRoot } from "./state.ts";

const role = process.argv[2] as Role;
let file: string | undefined;
try {
	const input = JSON.parse(readFileSync(0, "utf8")) as {
		tool_input?: { file_path?: string; notebook_path?: string };
	};
	file = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
} catch {
	// no payload: nothing to check
}

if (file && (role === "tests" || role === "impl")) {
	const relative = path
		.relative(repoRoot, path.resolve(file))
		.replaceAll("\\", "/");
	if (outOfBounds(role, [relative]).length > 0) {
		console.error(
			role === "tests"
				? `${relative} is not a test file: the test writer changes only tests. If the implementation or the contract needs something, say so in your report and the main agent will route it to the implementer.`
				: `${relative} is a test file: the implementer never changes tests. If a test looks wrong, explain why in your report (quote the spec) and the main agent will route it to the test writer.`,
		);
		process.exitCode = 2;
	}
}
