---
name: promote-correction
description: Turn a mistake the gates and reviewer missed into the strongest guard that works (type, then check, then one CLAUDE.md line) and log it in .workflow/misses.md. Run after a human review catches something.
argument-hint: "<PR number> <what was missed>"
disable-model-invocation: true
---

Input: `$ARGUMENTS` (a PR and the mistake). Find the mistake in that PR's diff (`gh pr diff <n>`) first.

Try these in order and stop at the first that works:
1. **Make it impossible to write**: change a type, a function signature or an API so the wrong code doesn't compile.
2. **Make a program catch it**: a Biome rule in `biome.json`, or a check in `scripts/` (wired into `pnpm lint`),
   whose failure message says how to fix it. Add a test showing it catches the mistake.
3. **One line in CLAUDE.md**, in the section it belongs to. If CLAUDE.md is over ~80 lines of rules, delete or merge
   one so it doesn't grow.

Show the diff and wait for approval; don't commit before it. Then append one line to `.workflow/misses.md`:
`YYYY-MM-DD | PR #<n> | <what the gates missed> | fix kind: code / script / prose`.
Commit the fix on its own branch (`chore/guard-<slug>`) as one Conventional Commit; the user opens the PR.
