---
name: kit-init
description: Install the agent kit (/feature, /deliver, reviewer, stop gate) into another repository, after auditing its gates. Run from a session in the target repo with this launchpad checkout added as a directory.
argument-hint: "<path to target repo, default: the current directory>"
disable-model-invocation: true
---

The kit lives in this skill's repository: `KIT=${CLAUDE_SKILL_DIR}/../../..`. Target: `$ARGUMENTS`, or the current
working directory. Run kit scripts as `node "$KIT/scripts/agent/kit.ts" <command> <target>`.

An autonomous loop is only as safe as its verify command. Autonomy (the Stop hook and the permissions that let a run
proceed unattended) is switched on only by `kit.ts prove`, after a deliberate bad change made verify fail.

1. **Audit**: `kit.ts detect <target>`. Show the user a table: verify, types, tests, lint, e2e, CI, CLAUDE.md, each
   found or missing. Missing verify: propose one script chaining what exists (lint → typecheck → test → build).
   Missing types AND tests: stop. Say the repo needs a test suite before autonomy, and offer to plan that first.
   Node older than 22.18: stop (the kit's scripts are TypeScript run by Node).
2. **Install**: on the user's OK, `kit.ts install <target>`. Then fill `scripts/agent/project.ts` with them:
   `VERIFY_COMMAND`, and `E2E_COMMAND`/`E2E_PATHS`, `MIGRATIONS_DIR`, `FORMAT_COMMAND` only if the repo has them.
3. **Wire the checks**: add `node scripts/check-test-integrity.ts` to the lint script and
   `node --test "scripts/**/*.test.ts"` to verify. Run verify; it must pass.
4. **CLAUDE.md**: if missing, write a minimal one (under 40 lines): commands (from package.json), where code goes
   (from the tree), the rules the user states, and the line "Workflow: `/feature` plans a spec, `/deliver <slug>` runs
   it to a PR (docs/agentic-workflow.md)". If present, add only that line.
5. **Prove**: pick one source file covered by verify and a line that must break it (a type error for typed code, a
   failing assertion appended to a test for untyped code). `kit.ts prove <target> <file> "<bad line>"`. It refuses
   unless verify passes clean and fails with the change, restores the file either way, and only then writes the
   hooks and permissions. If it refuses, report why; don't work around it.
6. Show `git diff --stat` and propose `Edit(/<dir>/**)` allow rules for the source folders, so unattended runs don't
   stop at permission prompts. Leave committing to the user (one `chore:` commit).
