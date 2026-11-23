// Claude Code's PostToolUse hook for Edit/Write: formats and lints the edited file with Biome. Problems Biome can't
// fix go to stderr with exit 2, which shows them to the agent right after its edit.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "./state.ts";

let file: string | undefined;
try {
	const input = JSON.parse(readFileSync(0, "utf8")) as {
		tool_input?: { file_path?: string };
	};
	file = input.tool_input?.file_path;
} catch {
	// no payload: nothing to check
}

const relative = file ? path.relative(repoRoot, path.resolve(file)) : "";
if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
	const result = spawnSync(
		`pnpm exec biome check --write --no-errors-on-unmatched "${relative}" 2>&1`,
		{
			cwd: repoRoot,
			shell: true,
			encoding: "utf8",
		},
	);
	if (result.status !== 0) {
		console.error(result.stdout);
		process.exitCode = 2;
	}
}
