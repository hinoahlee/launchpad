---
name: roadmap
description: Break a well-scoped app idea into an ordered queue of small specs, which scripts/agent/queue.ts then delivers and merges one after another. Interactive; nothing is built here.
argument-hint: "[the app idea]"
disable-model-invocation: true
---

Plan a whole series of features with the user. This conversation replaces every later `/feature` interview: once the
queue runs, nobody answers questions, so everything a spec needs must be settled here.

1. Read CLAUDE.md and skim the codebase's features. Then interview the user, a few questions at a time: who uses the
   app, the core flows, the data and who owns each row, what's out of scope, and the risky parts (auth, billing,
   migrations, files, external services).
2. Propose an ordered list of features, one line each. Each must:
   - pass `/feature`'s size check (small or medium; one reviewable PR);
   - stand on its own once merged: verify green, useful or at least testable, nothing half-wired;
   - depend only on items before it, never after.
   Foundations first (data, then API, then pages). Iterate on the list until the user agrees.
3. For each item, write `.agentic/specs/<slug>.md` in `/feature`'s spec format: every acceptance criterion names
   the test that proves it. Write it against the code as it will be once the earlier items are merged, naming the
   tables, schemas and routes they create. Ask the user only what the specs can't decide alone, batched.
4. Write `.agentic/queue.json`:
   ```json
   { "pauseEvery": 3, "items": [{ "slug": "<first>", "status": "pending" }, { "slug": "<second>", "status": "pending" }] }
   ```
   Optional `"model"` (e.g. `"sonnet"`) applies to every run.
5. Tell the user, briefly:
   - which items will stop for their review instead of merging themselves: those touching migrations, auth,
     billing, security headers, dependencies or the repo's checks (`HUMAN_REVIEW_PATHS` in
     `scripts/agent/project.ts`);
   - how to start it: `node scripts/agent/queue.ts` in a terminal at the repo root, machine kept awake; it stops
     after `pauseEvery` merges, after anything needing judgment, and when done; start it again to continue;
   - progress: `.agentic/queue.json` and `.agentic/queue.log`.
   Don't start the queue yourself.
