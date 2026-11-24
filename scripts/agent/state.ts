// The state file of a /deliver run, shared by the skill (phases, reviews) and the stop gate (verify results).
// Lives in .agentic/ (gitignored): it is a record of one run, not project code.
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PHASES = [
	"branch",
	"tests",
	"implement",
	"verify",
	"review",
	"fix",
	"pr",
	"done",
] as const;
export type Phase = (typeof PHASES)[number];

export const MAX_STOPS = 5;
export const MAX_REVIEW_ROUNDS = 2;

export type CheckResult = { ok: boolean; at: string; sha: string };

export type GateState = {
	stops: number;
	verifyFailures: number;
	lastFailure?: string;
	greenFingerprint?: string;
	e2eGreenFingerprint?: string;
	lastVerify?: CheckResult;
	lastE2e?: CheckResult;
};

export type ReviewRecord = {
	round: number;
	status: "ok" | "interrupted" | "malformed";
	confirmed: number;
	plausible: number;
	style: number;
	file?: string;
	at: string;
};

export type RunState = {
	slug?: string;
	type?: string;
	branch?: string;
	phase?: Phase;
	slice?: number;
	handoff?: { role: "tests" | "impl"; base: string; at: string };
	disputes?: string[];
	reviewRounds?: number;
	outcome?: string;
	note?: string;
	startedAt?: string;
	history?: { phase: Phase; at: string }[];
	reviews?: ReviewRecord[];
	gate: GateState;
};

export const repoRoot = path.resolve(
	fileURLToPath(new URL("../..", import.meta.url)),
);
export const workflowDir = (root: string) => path.join(root, ".agentic");
export const statePath = (root: string) =>
	path.join(workflowDir(root), "state.json");

export const freshState = (): RunState => ({
	gate: { stops: 0, verifyFailures: 0 },
});

export function readState(root: string): RunState {
	const file = statePath(root);
	if (!existsSync(file)) return freshState();
	try {
		const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<RunState>;
		return { ...parsed, gate: { ...freshState().gate, ...parsed.gate } };
	} catch {
		// A half-written or hand-mangled file must not wedge every Stop: start over, keep the bad copy to inspect.
		renameSync(file, `${file}.corrupt-${Date.now()}`);
		return freshState();
	}
}

export function writeState(root: string, state: RunState): void {
	mkdirSync(workflowDir(root), { recursive: true });
	const file = statePath(root);
	writeFileSync(`${file}.tmp`, `${JSON.stringify(state, null, "\t")}\n`);
	renameSync(`${file}.tmp`, file); // atomic: an interrupted write never leaves half a file
}

export function isRunActive(state: RunState): boolean {
	return state.phase !== undefined && state.phase !== "done";
}

export function archiveState(root: string, slug: string): string {
	const dir = path.join(workflowDir(root), "runs");
	mkdirSync(dir, { recursive: true });
	let target = path.join(dir, `${slug}.json`);
	if (existsSync(target)) target = path.join(dir, `${slug}-${Date.now()}.json`);
	renameSync(statePath(root), target);
	return target;
}
