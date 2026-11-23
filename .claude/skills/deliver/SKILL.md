---
name: deliver
description: Unattended run from an approved spec (.agentic/specs/<slug>.md) to an open PR. Resumable; run again with the same slug after any interruption. Started by /feature on the user's "go", or by the user.
argument-hint: "<slug>"
---

You are running unattended: the user is away. Never ask questions; when blocked, record why and stop (step 9).
Slug: `$ARGUMENTS`. Spec: `.agentic/specs/$ARGUMENTS.md` (missing: stop and say so).

## Rules for the whole run
- **State lives in `node scripts/agent/run.ts`**, not in your memory. Record each phase BEFORE starting it:
  `node scripts/agent/run.ts phase <name> [slice]`. Never edit `.agentic/state.json` by hand.
- **Every step must be safe to repeat.** After any interruption the run restarts from the recorded phase.
- **"Done" is an exit code**, never your judgment. `node scripts/agent/run.ts check` runs `pnpm verify` (+ `pnpm e2e`
  when the change can affect a browser) and prints only the failing tail. The Stop hook runs the same gate and blocks
  you from finishing until it passes; don't try to get around it, and never skip, weaken or delete a test or check.
- Keep context small: read only the files you need; for long command output use the tail.
- Use the Bash tool for commands (the permission allowlist is written for it), one plain command per call: no
  `node -e`, heredocs or scripts in other languages (they aren't allowed, and a permission prompt stalls the run).
  `run.ts` output is already short: don't pipe or redirect it. Edit files, `.agentic/pr.md` included, with Edit.
- Keep your own context small: the agents read and write the code; you read their reports, the spec and run.ts output.

## 0. Start or resume
`node scripts/agent/run.ts start $ARGUMENTS <type from the spec: feat|fix>`. It prints `START` or `RESUME ... at
phase X` with the state. On RESUME: `git status` and `git log --oneline origin/main..HEAD` to see what is done, then
jump to that phase's step below. Never redo a finished phase.

## 1. branch
`git switch <type>/<slug>` if it exists, else `git switch -c <type>/<slug>` from an up-to-date main.

## Two builders, you coordinate
You don't write code or tests yourself. The `test-writer` subagent writes tests (and only tests) from the spec; the
`implementer` subagent writes code (never tests). Every time you spawn one:
1. Commit anything pending, then `node scripts/agent/run.ts handoff tests|impl` (it needs a clean tree).
2. Spawn the agent with the spec path, what it should do, and the other agent's report if relevant. Nothing else.
3. `node scripts/agent/run.ts boundary`. A violation: restore the listed files as it says, then spawn the same
   agent again with the violation message. Never keep out-of-bounds changes.
4. Commit: `wip: <slug> tests`, `wip: <slug> impl <n>` (checkpoints; the PR is squash-merged).
If an agent fails with an API/usage error, its partial work is still in the tree: spawn it again with "continue
from the working tree". On resume in the middle of a handoff, do the same.

## 2. tests (`phase tests`)
Spawn `test-writer`: "Write the tests for `.agentic/specs/<slug>.md`." Its report must say FAILING AS EXPECTED: yes.
For a bug fix, the first test must fail for the reported reason. If it says no, spawn it once more with its own
report; still no: stop (step 9).

## 3. implement (`phase implement <n>`, n = 1, then 2 for a dispute round)
Spawn `implementer`: "Implement `.agentic/specs/<slug>.md` so these tests pass: <files from the test report>.
The test writer needs: <its NEEDS FROM THE IMPLEMENTER>."
**Disputes**: when its report lists DISPUTED TESTS, decide each one against the spec, not against which agent sounds
surer. Spec backs the test: spawn `implementer` again with your ruling. Spec backs the dispute: handoff `tests` and
spawn `test-writer` with the dispute and your ruling, then implement round 2. Spec unclear: don't guess; note it for
the PR (What) and keep the test as written. At most 2 implement rounds; still disputed or failing: step 9.

## 4. verify (`phase verify`)
`node scripts/agent/run.ts check` must pass. If it fails, route the failure: a test file → `test-writer`, anything
else → `implementer` (with handoff and boundary as above). Never fix it yourself.

## 5. review (`phase review`)
1. `node scripts/agent/run.ts diff` (writes `.agentic/review/<slug>.diff`).
2. Spawn the `reviewer` subagent with ONLY this prompt: "Review the diff at `.agentic/review/<slug>.diff` against the
   spec at `.agentic/specs/<slug>.md`." Nothing else: no summary of what you did.
3. Write its reply, verbatim, to `.agentic/review/<slug>-r<round>.txt` and run
   `node scripts/agent/run.ts review <round> .agentic/review/<slug>-r<round>.txt`.
   - If the subagent failed (API error, "terminated early", usage limit), run `review <round> --interrupted` and
     spawn it again; an interrupted review is NOT "no findings". If it fails twice, stop (step 9: gave-up, reason).
   - `MALFORMED`: spawn it again once, reminding it of the output format.

## 6. fix (`phase fix`)
Route each CONFIRMED finding (only those) the same way: about a test → `test-writer`, otherwise → `implementer`,
each with handoff and boundary. Then `run.ts check`, commit `wip: <slug> review fixes <round>`. Round 1 → go back to
step 5 as round 2. After round 2, don't review again: remaining findings go in the PR.

## 7. pr (`phase pr`)
1. `node scripts/agent/run.ts check` must pass on the final commit.
2. `node scripts/agent/pr-body.ts > .agentic/pr.md`, then replace only the `TODO(agent)` parts (What, Why, Read in
   this order, and why each existing test changed, from the test writer's reports). Note any dispute and your ruling
   under What. Don't touch the generated record.
3. `git push -u origin HEAD`, then `gh pr create --title "<type>: <summary>" --body-file .agentic/pr.md`
   (Conventional Commit title; it becomes the squash commit). If a PR exists, `gh pr view` it instead.

## 8. done
`node scripts/agent/run.ts finish pr-opened <pr url>`. Report the URL in one line. Never merge.

## 9. Blocked or not converging
Stop instead of looping: the same failure three times, a spec that can't be met, a needed dependency or secret, or
the stop gate saying it gave up. Commit what you have. If there are commits worth reading, build the body as in
step 7, put the reason at the top of What, push and `gh pr create --draft`. Then
`node scripts/agent/run.ts finish gave-up "<why>"`.
