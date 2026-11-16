# Glossary

Terms in the order they were introduced. Each one: a one-line definition, and the step that introduced it.

## Phase 0 — Workspace
- **Trunk-based development** — everyone merges small changes into one main branch (the trunk) often, instead
  of keeping long-lived branches. (0.1)
- **Pull request (PR)** — a request to merge a branch into another, with a diff and discussion for review. (0.1)
- **Branch ruleset** — server-side rules GitHub enforces on matching branches, e.g. "changes only through a
  PR", "no force-push". (0.1)
- **Squash merge** — merges a PR as one single commit on the target branch, so `main` has one commit per
  change. (0.1)
- **Workspace** — one repo holding several packages that are installed together and can depend on each other
  (`workspace:*`). (0.2)
- **Lockfile** — `pnpm-lock.yaml`: the exact resolved version of every dependency, so every install is
  identical. (0.2)
- **Catalog** — the `catalog:` list in `pnpm-workspace.yaml`; packages write `"catalog:"` instead of a version,
  so there is one version per dependency. (0.2)
- **Task graph** — the order Turborepo runs tasks in, derived from package dependencies (`^build` = build my
  dependencies first); unchanged tasks come from cache. (0.2)
- **Linter vs. formatter** — a linter finds likely bugs and bad patterns; a formatter only rewrites layout
  (spacing, quotes). Biome does both. (0.2)
- **Fail fast** — stop at the first sign of a bad state (e.g. invalid config at boot) instead of limping on and
  failing later in a confusing place. (0.3)
- **App factory** — a function (`buildApp(config)`) that returns a configured app without starting it, so
  tests and the server build it the same way. (0.3)
- **Liveness vs. readiness probe** — liveness (`/api/health`): "the process is alive, don't restart me";
  readiness (`/api/ready`): "I can serve traffic, route requests to me". (0.3)
- **Structured logging** — logs as one JSON object per line with named fields, so tools can filter and
  search them. (0.3)
- **Request ID** — a unique ID per request, put on every log line for that request and returned in the
  `x-request-id` header, so one request can be traced end to end. (0.3)
- **`SIGTERM`** — the signal a platform sends to ask a process to stop (Ctrl+C sends `SIGINT`); after a grace
  period it sends `SIGKILL`, which can't be caught. (0.3)
