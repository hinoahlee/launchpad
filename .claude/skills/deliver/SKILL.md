---
name: deliver
description: Unattended run from an approved spec (.workflow/specs/<slug>.md) to an open PR. Resumable; run again with the same slug after any interruption. Started by /feature on the user's "go", or by the user.
argument-hint: "<slug>"
---

You are running unattended: the user is away. Never ask questions; when blocked, record why and stop (step 9).
Slug: `$ARGUMENTS`. Spec: `.workflow/specs/$ARGUMENTS.md` (missing: stop and say so).

## Rules for the whole run
- **State lives in `node scripts/agent/run.ts`**, not in your memory. Record each phase BEFORE starting it:
  `node scripts/agent/run.ts phase <name> [slice]`. Never edit `.workflow/state.json` by hand.
- **Every step must be safe to repeat.** After any interruption the run restarts from the recorded phase.
- **"Done" is an exit code**, never your judgment. `node scripts/agent/run.ts check` runs `pnpm verify` (+ `pnpm e2e`
  when the change can affect a browser) and prints only the failing tail. The Stop hook runs the same gate and blocks
  you from finishing until it passes; don't try to get around it, and never skip, weaken or delete a test or check.
- Keep context small: read only the files you need; for long command output use the tail.
- Use the Bash tool for commands (the permission allowlist is written for it), one plain command per call: no
  `node -e`, heredocs or scripts in other languages (they aren't allowed, and a permission prompt stalls the run).
  `run.ts` output is already short: don't pipe or redirect it. Edit files, `.workflow/pr.md` included, with Edit.
- Use cheaper means for mechanical steps: run commands yourself rather than spawning helpers.

## 0. Start or resume
`node scripts/agent/run.ts start $ARGUMENTS <type from the spec: feat|fix>`. It prints `START` or `RESUME ... at
phase X` with the state. On RESUME: `git status` and `git log --oneline origin/main..HEAD` to see what is done, then
jump to that phase's step below. Never redo a finished phase.

## 1. branch
`git switch <type>/<slug>` if it exists, else `git switch -c <type>/<slug>` from an up-to-date main.

## 2. tests (`phase tests`)
Bug fix: write the failing test from the first criterion, run it (scoped: `pnpm --filter <pkg> exec vitest run <file>`),
and confirm it fails *for the reported reason*. Feature: write the tests each criterion names, where it helps to
have them first. Commit: `wip: <slug> tests`.

## 3. implement (`phase implement <n>` before each slice)
Follow CLAUDE.md's recipe in small slices (contract → data → API → API tests → web). After each slice run its scoped
tests, then commit `wip: <slug> slice <n>` (checkpoint; the PR is squash-merged). On resume, the last `wip:` commit
tells you which slice is next.

## 4. verify (`phase verify`)
`node scripts/agent/run.ts check` until it passes. Fix causes, not symptoms. Commit.

## 5. review (`phase review`)
1. `node scripts/agent/run.ts diff` (writes `.workflow/review/<slug>.diff`).
2. Spawn the `reviewer` subagent with ONLY this prompt: "Review the diff at `.workflow/review/<slug>.diff` against the
   spec at `.workflow/specs/<slug>.md`." Nothing else: no summary of what you did.
3. Write its reply, verbatim, to `.workflow/review/<slug>-r<round>.txt` and run
   `node scripts/agent/run.ts review <round> .workflow/review/<slug>-r<round>.txt`.
   - If the subagent failed (API error, "terminated early", usage limit), run `review <round> --interrupted` and
     spawn it again; an interrupted review is NOT "no findings". If it fails twice, stop (step 9: gave-up, reason).
   - `MALFORMED`: spawn it again once, reminding it of the output format.

## 6. fix (`phase fix`)
Fix each CONFIRMED finding (only those), then `run.ts check`, commit `wip: <slug> review fixes <round>`. Round 1 →
go back to step 5 as round 2. After round 2, don't review again: remaining findings go in the PR.

## 7. pr (`phase pr`)
1. `node scripts/agent/run.ts check` must pass on the final commit.
2. `node scripts/agent/pr-body.ts > .workflow/pr.md`, then replace only the three `TODO(agent)` parts (What, Why,
   Read in this order). Don't touch the generated record.
3. `git push -u origin HEAD`, then `gh pr create --title "<type>: <summary>" --body-file .workflow/pr.md`
   (Conventional Commit title; it becomes the squash commit). If a PR exists, `gh pr view` it instead.

## 8. done
`node scripts/agent/run.ts finish pr-opened <pr url>`. Report the URL in one line. Never merge.

## 9. Blocked or not converging
Stop instead of looping: the same failure three times, a spec that can't be met, a needed dependency or secret, or
the stop gate saying it gave up. Commit what you have. If there are commits worth reading, build the body as in
step 7, put the reason at the top of What, push and `gh pr create --draft`. Then
`node scripts/agent/run.ts finish gave-up "<why>"`.
