// Installs the agent kit into another repository (driven by the /kit-init skill):
//   detect <target>                       which gates exist: package manager, scripts, types, tests, lint, CI
//   install <target>                      copy the generic files; write project.ts from a template if missing
//   prove <target> <file> <bad line>      verify must pass, then FAIL with <bad line> appended to <file>; only
//                                         then are the hooks and permissions written (autonomy is enabled)
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot } from "./state.ts";

const GENERIC = [
	"scripts/agent/state.ts",
	"scripts/agent/checks.ts",
	"scripts/agent/gate.ts",
	"scripts/agent/gate.test.ts",
	"scripts/agent/stop-gate.ts",
	"scripts/agent/run.ts",
	"scripts/agent/review.ts",
	"scripts/agent/review.test.ts",
	"scripts/agent/pr-body.ts",
	"scripts/agent/format-hook.ts",
	"scripts/test-integrity.ts",
	"scripts/test-integrity.test.ts",
	"scripts/check-test-integrity.ts",
	".claude/skills/feature/SKILL.md",
	".claude/skills/deliver/SKILL.md",
	".claude/skills/promote-correction/SKILL.md",
	".claude/agents/reviewer.md",
	"docs/agentic-workflow.md",
];

const LOCKFILES: [string, string][] = [
	["pnpm-lock.yaml", "pnpm"],
	["package-lock.json", "npm"],
	["yarn.lock", "yarn"],
	["bun.lock", "bun"],
	["bun.lockb", "bun"],
];

const [command, targetArg, ...rest] = process.argv.slice(2);
if (!command || !targetArg) {
	console.error("usage: kit.ts <detect|install|prove> <target repo> [...]");
	process.exit(1);
}
const target = path.resolve(targetArg);
const at = (...parts: string[]) => path.join(target, ...parts);

function packageManager(): string {
	return LOCKFILES.find(([file]) => existsSync(at(file)))?.[1] ?? "npm";
}

function run(commandLine: string): { ok: boolean; output: string } {
	const result = spawnSync(`${commandLine} 2>&1`, {
		cwd: target,
		shell: true,
		encoding: "utf8",
		maxBuffer: 256 * 1024 * 1024,
	});
	return {
		ok: result.status === 0,
		output: (result.stdout ?? "").split(/\r?\n/).slice(-25).join("\n"),
	};
}

function detect() {
	const pkg = existsSync(at("package.json"))
		? JSON.parse(readFileSync(at("package.json"), "utf8"))
		: undefined;
	const scripts: Record<string, string> = pkg?.scripts ?? {};
	const has = (...names: string[]) => names.find((name) => scripts[name]);
	const workflows = existsSync(at(".github/workflows"))
		? readdirSync(at(".github/workflows"))
		: [];
	const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
	return {
		packageManager: packageManager(),
		node: `${process.versions.node} (${major > 22 || (major === 22 && minor >= 18) ? "ok" : "too old: need 22.18+ for .ts scripts"})`,
		gates: {
			verify: has("verify", "check", "ci") ?? null,
			types:
				has("typecheck", "type-check", "tsc") ??
				(existsSync(at("tsconfig.json")) ? "tsconfig.json (no script)" : null),
			tests: has("test") ?? null,
			lint: has("lint") ?? null,
			e2e: has("e2e", "test:e2e") ?? null,
			ci: workflows.length ? workflows.join(", ") : null,
		},
		claudeMd: existsSync(at("CLAUDE.md")),
		originMain: run("git rev-parse --verify origin/main").ok,
	};
}

function install() {
	for (const file of GENERIC) {
		mkdirSync(path.dirname(at(file)), { recursive: true });
		copyFileSync(path.join(repoRoot, file), at(file));
	}
	const project = at("scripts/agent/project.ts");
	if (!existsSync(project)) {
		const pm = packageManager();
		writeFileSync(
			project,
			`// The only project-specific file of the agent kit; every other kit file is identical everywhere.\n\n// Must exit non-zero on a bad change.\nexport const VERIFY_COMMAND = "${pm} run verify";\n// Empty: no e2e gate.\nexport const E2E_COMMAND = "";\nexport const E2E_PATHS: RegExp[] = [];\n// Empty: no migration check.\nexport const MIGRATIONS_DIR = "";\nexport const MIGRATION_JOURNAL = "";\n// Empty: no format hook.\nexport const FORMAT_COMMAND = "";\n`,
		);
	}
	const gitignore = existsSync(at(".gitignore"))
		? readFileSync(at(".gitignore"), "utf8")
		: "";
	if (!gitignore.includes(".workflow/"))
		writeFileSync(
			at(".gitignore"),
			`${gitignore.trimEnd()}\n\n# Agent run state (kit)\n.workflow/\n`,
		);
	console.log(
		`copied ${GENERIC.length} files; edit scripts/agent/project.ts, then run prove`,
	);
}

async function prove(file: string, badLine: string) {
	const { VERIFY_COMMAND } = (await import(
		pathToFileURL(at("scripts/agent/project.ts")).href
	)) as { VERIFY_COMMAND: string };
	const clean = run(VERIFY_COMMAND);
	if (!clean.ok)
		throw new Error(
			`\`${VERIFY_COMMAND}\` fails on the clean tree; fix that first:\n${clean.output}`,
		);
	const original = readFileSync(at(file));
	writeFileSync(
		at(file),
		`${original.toString("utf8").trimEnd()}\n${badLine}\n`,
	);
	let bad: { ok: boolean; output: string };
	try {
		bad = run(VERIFY_COMMAND);
	} finally {
		writeFileSync(at(file), original);
	}
	if (bad.ok)
		throw new Error(
			`\`${VERIFY_COMMAND}\` PASSED with a deliberate bad change in ${file}. The gate has no teeth: autonomy stays off. Add the missing check (types, tests or lint) first.`,
		);
	console.log(`verify fails on the bad change, as it must:\n${bad.output}\n`);
	enableHooks();
}

function enableHooks() {
	const file = at(".claude/settings.json");
	const settings = existsSync(file)
		? JSON.parse(readFileSync(file, "utf8"))
		: {};
	const pm = packageManager();
	const node = (script: string, args = "") => ({
		type: "command",
		command: `node "\${CLAUDE_PROJECT_DIR}/scripts/agent/${script}"${args}`,
	});
	settings.hooks = {
		...settings.hooks,
		PostToolUse: [
			{
				matcher: "Edit|Write|MultiEdit",
				hooks: [{ ...node("format-hook.ts"), timeout: 60 }],
			},
		],
		UserPromptSubmit: [
			{ hooks: [{ ...node("stop-gate.ts", " --reset"), timeout: 10 }] },
		],
		Stop: [{ hooks: [{ ...node("stop-gate.ts"), timeout: 1200 }] }],
	};
	const allow = [
		`Bash(${pm}:*)`,
		"Bash(git:*)",
		"Bash(node scripts/*)",
		"Bash(gh pr create:*)",
		"Bash(gh pr view:*)",
	].concat(
		["cat", "head", "tail", "grep", "ls", "wc", "echo"].map(
			(tool) => `Bash(${tool}:*)`,
		),
		["Edit(/.workflow/**)"],
	);
	const ask = [
		"Bash(gh pr merge:*)",
		"Bash(git push --force *)",
		"Bash(git push -f *)",
		"Bash(git reset --hard *)",
	];
	const permissions = settings.permissions ?? {};
	const merge = (list: string[] = [], extra: string[]) => [
		...new Set([...list, ...extra]),
	];
	settings.permissions = {
		...permissions,
		allow: merge(permissions.allow, allow),
		ask: merge(permissions.ask, ask),
	};
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, `${JSON.stringify(settings, null, "\t")}\n`);
	writeFileSync(
		at(".workflow", "kit-proof.json"),
		JSON.stringify({ provenAt: new Date().toISOString() }),
	);
	console.log(
		"autonomy enabled: Stop gate, format hook and permissions written to .claude/settings.json",
	);
}

try {
	if (command === "detect") console.log(JSON.stringify(detect(), null, 2));
	else if (command === "install") install();
	else if (command === "prove" && rest.length === 2) {
		mkdirSync(at(".workflow"), { recursive: true });
		await prove(rest[0] ?? "", rest[1] ?? "");
	} else
		throw new Error(
			"usage: kit.ts <detect|install|prove> <target> [<file> <bad line>]",
		);
} catch (error) {
	console.error((error as Error).message);
	process.exitCode = 1;
}
