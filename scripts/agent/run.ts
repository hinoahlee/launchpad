// The /deliver skill's state machine, so phase bookkeeping is a program, not the model editing JSON:
//   start <slug> <type>        create the run, or print where an existing one stopped
//   status                     print the state
//   phase <name> [slice]       record the phase BEFORE starting it
//   check                      verify (+ e2e when the change can affect a browser); prints only the tail
//   handoff <tests|impl>       record which agent works next, from a clean commit
//   boundary                   fail if that agent changed files on the other side of the test/impl line
//   diff                       write the branch's diff for the reviewer: .agentic/review/<slug>.diff
//   review <round> <file|--interrupted>   record a reviewer round; prints the CONFIRMED findings
//   dispute "<ruling>"         record a test dispute and how it was ruled (a queued run then waits for a person)
//   finish <pr-opened|gave-up> [note]     close the run: state.json → .agentic/runs/<slug>.json
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Check } from "./checks.ts";
import {
	changedFiles,
	commandFor,
	fingerprint,
	headSha,
	needsE2e,
	runCheck,
} from "./checks.ts";
import { checkBoundary, startHandoff } from "./handoff.ts";
import { parseReview } from "./review.ts";
import {
	archiveState,
	freshState,
	isRunActive,
	MAX_REVIEW_ROUNDS,
	PHASES,
	type Phase,
	type RunState,
	readState,
	repoRoot,
	workflowDir,
	writeState,
} from "./state.ts";

const root = repoRoot;
const [command, ...args] = process.argv.slice(2);
const state = readState(root);
const now = () => new Date().toISOString();

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

function requireRun(): Required<Pick<RunState, "slug" | "phase">> & RunState {
	if (!isRunActive(state) || !state.slug)
		fail(
			"no active run: start one with `node scripts/agent/run.ts start <slug> <type>`",
		);
	return state as Required<Pick<RunState, "slug" | "phase">> & RunState;
}

function summary(s: RunState): string {
	const {
		lastFailure: _omit,
		greenFingerprint: _a,
		e2eGreenFingerprint: _b,
		...gate
	} = s.gate;
	return JSON.stringify({ ...s, history: undefined, gate }, null, 2);
}

switch (command) {
	case "start": {
		const [slug, type = "feat"] = args;
		if (!slug || !/^[a-z0-9-]+$/.test(slug))
			fail("usage: start <kebab-slug> <feat|fix|chore|refactor>");
		if (isRunActive(state)) {
			if (state.slug !== slug)
				fail(
					`another run is active: ${state.slug} (phase ${state.phase}). Finish it first.`,
				);
			console.log(`RESUME ${slug} at phase ${state.phase}\n${summary(state)}`);
			break;
		}
		const run: RunState = {
			...freshState(),
			slug,
			type,
			branch: `${type}/${slug}`,
			phase: "branch",
			slice: 0,
			reviewRounds: 0,
			startedAt: now(),
			history: [{ phase: "branch", at: now() }],
			reviews: [],
		};
		writeState(root, run);
		console.log(`START ${slug}\n${summary(run)}`);
		break;
	}
	case "status":
		console.log(summary(state));
		break;
	case "phase": {
		const run = requireRun();
		const [name, slice] = args;
		if (!PHASES.includes(name as Phase))
			fail(`phase must be one of: ${PHASES.join(", ")}`);
		run.phase = name as Phase;
		if (slice !== undefined) run.slice = Number(slice);
		run.history = [...(run.history ?? []), { phase: run.phase, at: now() }];
		writeState(root, run);
		console.log(
			`phase: ${run.phase}${slice !== undefined ? ` (slice ${slice})` : ""}`,
		);
		break;
	}
	case "handoff":
	case "boundary": {
		const run = requireRun();
		try {
			const message =
				command === "handoff"
					? startHandoff(root, run, args[0] ?? "")
					: checkBoundary(root, run);
			writeState(root, run);
			console.log(message);
		} catch (error) {
			fail((error as Error).message);
		}
		break;
	}
	case "check": {
		const print = fingerprint(root);
		const scripts: Check[] = ["verify"];
		if (needsE2e(changedFiles(root))) scripts.push("e2e");
		for (const script of scripts) {
			const result = runCheck(root, script);
			const record = { ok: result.ok, at: now(), sha: headSha(root) };
			if (script === "verify") state.gate.lastVerify = record;
			else state.gate.lastE2e = record;
			if (result.ok && script === "verify") state.gate.greenFingerprint = print;
			if (result.ok && script === "e2e") state.gate.e2eGreenFingerprint = print;
			writeState(root, state);
			if (!result.ok) fail(`FAIL ${commandFor(script)}\n${result.tail}`);
			console.log(`ok ${commandFor(script)}`);
		}
		break;
	}
	case "diff": {
		const run = requireRun();
		const diff = execFileSync("git", ["diff", "origin/main...HEAD"], {
			cwd: root,
			encoding: "utf8",
			maxBuffer: 256 * 1024 * 1024,
		});
		const dir = path.join(workflowDir(root), "review");
		mkdirSync(dir, { recursive: true });
		const file = path.join(dir, `${run.slug}.diff`);
		writeFileSync(file, diff);
		console.log(
			`${path.relative(root, file).replaceAll("\\", "/")} (${diff.split("\n").length} lines)`,
		);
		break;
	}
	case "review": {
		const run = requireRun();
		const [roundArg, source] = args;
		const round = Number(roundArg);
		if (!(round >= 1 && round <= MAX_REVIEW_ROUNDS) || !source)
			fail(`usage: review <1-${MAX_REVIEW_ROUNDS}> <file|--interrupted>`);
		const others = (run.reviews ?? []).filter((r) => r.round !== round);
		if (source === "--interrupted") {
			run.reviews = [
				...others,
				{
					round,
					status: "interrupted",
					confirmed: 0,
					plausible: 0,
					style: 0,
					at: now(),
				},
			];
			writeState(root, run);
			console.log(
				`review round ${round}: interrupted (not a verdict; re-run this round later)`,
			);
			break;
		}
		const parsed = parseReview(readFileSync(source, "utf8"));
		const count = (kind: string) =>
			parsed.findings.filter((f) => f.kind === kind).length;
		const file = path
			.relative(root, path.resolve(source))
			.replaceAll("\\", "/");
		run.reviews = [
			...others,
			{
				round,
				status: parsed.status,
				confirmed: count("CONFIRMED"),
				plausible: count("PLAUSIBLE"),
				style: count("STYLE"),
				file,
				at: now(),
			},
		];
		if (parsed.status === "ok")
			run.reviewRounds = Math.max(run.reviewRounds ?? 0, round);
		writeState(root, run);
		if (parsed.status === "malformed")
			fail(
				`review round ${round}: MALFORMED (no finding lines, no "NO FINDINGS"). Re-run the reviewer.`,
			);
		const confirmed = parsed.findings.filter((f) => f.kind === "CONFIRMED");
		console.log(
			`review round ${round}: ${confirmed.length} confirmed, ${count("PLAUSIBLE")} plausible, ${count("STYLE")} style`,
		);
		for (const f of confirmed) console.log(`CONFIRMED ${f.location} ${f.text}`);
		break;
	}
	case "dispute": {
		const run = requireRun();
		if (!args.length)
			fail('usage: dispute "<test>: <your ruling and the spec line>"');
		run.disputes = [...(run.disputes ?? []), args.join(" ")];
		writeState(root, run);
		console.log(`dispute recorded (${run.disputes.length})`);
		break;
	}
	case "finish": {
		const run = requireRun();
		const [outcome, ...note] = args;
		if (outcome !== "pr-opened" && outcome !== "gave-up")
			fail("usage: finish <pr-opened|gave-up> [note]");
		run.phase = "done";
		run.outcome = outcome;
		if (note.length) run.note = note.join(" ");
		run.history = [...(run.history ?? []), { phase: "done", at: now() }];
		writeState(root, run);
		console.log(
			`run archived: ${path.relative(root, archiveState(root, run.slug)).replaceAll("\\", "/")}`,
		);
		break;
	}
	default:
		fail(
			"usage: run.ts <start|status|phase|check|diff|review|finish> ... (see the top of scripts/agent/run.ts)",
		);
}
