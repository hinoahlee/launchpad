---
name: feature
description: Plan a feature or bug fix with the user and write a spec whose every acceptance criterion names the test that proves it; on the user's "go", hands off to /deliver. Use when the user wants to plan or start a feature or fix.
argument-hint: "[short description]"
disable-model-invocation: true
---

Plan a change with the user, interactively. Nothing is built in this skill.

1. Read CLAUDE.md's recipe for adding a feature, if it has one, and the closest existing feature. Skim, don't
   summarize it back.
2. Interview the user, a few questions at a time: the problem (in their words), non-goals, who owns each new row
   (user or organization), and risk areas: auth, migrations, files, billing, the CSP. Is it a feature or a bug fix?
3. **Size check.** `/deliver` builds one spec into one PR unattended, which works for small and medium changes:
   a new endpoint with its page, a table plus its API, a fix touching a few files. Accept those without comment.
   Push back only when it clearly won't fit one reviewable PR, for example:
   - more than ~8 acceptance criteria;
   - several new tables AND several new pages AND a new external service, all at once;
   - two or more features that each make sense on their own ("auth and billing and an admin area").
   Then say why in one or two sentences and propose a first piece that stands on its own, so the rest can be later
   `/feature` runs. If the user still wants it whole, go ahead and note the size under Risk areas.
4. Draft acceptance criteria. For EACH one ask: "what command, test or e2e journey proves this?" A criterion without
   an answer is not accepted: push back, split it, or make it checkable. "Works well" is not a criterion.
   For a bug fix, the first criterion is a test that fails today for the reported reason.
5. Pick a kebab-case slug and write `.agentic/specs/<slug>.md`:

   ```markdown
   # <title>
   type: feat | fix
   ## Problem
   ## Non-goals
   ## Acceptance criteria
   - [ ] <criterion> — verified by: <test file + name, or command, or e2e journey>
   ## Data and ownership
   ## Risk areas
   ## Stop condition
   `pnpm verify` green, every "verified by" test exists and fails without the change[, `pnpm e2e` green]
   ```
   Include `pnpm e2e` in the stop condition when the change touches pages, auth, files or the CSP.
6. Show the spec and wait. Change it until the user says "go". On "go", run `/deliver <slug>` (the Skill tool,
   skill `deliver`, args `<slug>`).
