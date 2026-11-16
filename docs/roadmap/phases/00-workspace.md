# Phase 0 — Workspace

**Goal:** a local monorepo with an API health endpoint and the default React page, on GitHub, where every
change after this phase arrives as a small PR.
**You'll need:** the tools in `setup.md`. **Cost:** $0.

### 0.1 Repo + working agreement
- **Build:** `git init`; `.gitignore`, `.gitattributes`, `README.md` stub; `CLAUDE.md` (project map, commands,
  "follow `docs/roadmap/rules.md`"); `.claude/settings.json` (permissions from `rules.md`);
  `.github/pull_request_template.md`; `docs/glossary.md`; `docs/decisions/000-template.md`. Public GitHub repo
  via `gh repo create` (GitHub Free enforces rulesets only on public repos). Ruleset on `main`: require a PR, block force-push, squash merge only, delete branches
  after merge. This is the only step committed straight to `main`.
- **Why:** every later change becomes a small PR you can review, like on a real team.
- **Terms:** trunk-based development, pull request (PR), branch ruleset, squash merge.
- 🧑 **You:** approve `gh repo create`.
- **Done when:** the repo is on GitHub and `git push origin main` is rejected.

### 0.2 Workspace tooling
- **Build:** pnpm workspaces with a `catalog:`, `packageManager` + `engines`, `.nvmrc` (Node 24), Turborepo,
  Biome (defaults), `packages/tsconfig` (strict `base` + `react`). Root scripts: `dev`, `build`, `typecheck`,
  `lint`, `format`, `test`, `verify`. Decision `001-monorepo.md`.
- **Why:** one install, one lockfile, one version of each dependency; Turborepo runs tasks in dependency order
  and caches them.
- **Terms:** workspace, lockfile, catalog, task graph, linter vs. formatter.
- **Ref:** turborepo root config.
- **Done when:** `pnpm install && pnpm lint` passes.

### 0.3 API skeleton
- **Build:** `apps/api` with Fastify. `config.ts` (Zod: `NODE_ENV`, `PORT`, `LOG_LEVEL`), `buildApp(config)`,
  `server.ts`, pino JSON logs, request IDs (accept `x-request-id` or generate; echo it back),
  `GET /api/health` and `GET /api/ready`, graceful shutdown on `SIGTERM`/`SIGINT`. Runs `.ts` directly
  (`node --watch-path=src`).
- **Why:** the app factory makes testing easy; health endpoints and clean shutdown are what every platform
  needs to run you safely.
- **Terms:** app factory, liveness vs. readiness probe, structured logging, request ID, `SIGTERM`, fail fast.
- **Ref:** turborepo `apps/api/src/config.ts`, `app.ts`, `server.ts`.
- **Done when:** `curl -i localhost:3000/api/health` → 200 with `x-request-id`; `PORT=abc` exits with a clear
  error; Ctrl+C logs a shutdown line.

### 0.4 Web skeleton
- **Build:** `apps/web` from the stock Vite React TS template; dev proxy for `/api`; one line showing the
  result of `/api/health`.
- **Why:** the proxy makes dev look like production: one origin.
- **Terms:** SPA, dev server, proxy, HMR, origin.
- **Done when:** `pnpm dev` → `localhost:5173` shows "API: ok".

### 0.5 Tests + verify
- **Build:** Vitest in `apps/api`; health test via `app.inject()`. `pnpm verify` = lint, typecheck, test, build.
- **Why:** one command that answers "is this safe to merge?", locally and in CI.
- **Terms:** unit vs. integration test, in-process HTTP injection, test runner.
- **Done when:** `pnpm verify` is green.

### 0.6 Conventions as lint rules
- **Build:** Biome rules for kebab-case files, named exports, `process.env` only in `config.ts`, no `../`
  imports (`"imports": { "#*": "./src/*" }` per package). Built-in rules only. Decision `007-mechanical-guardrails.md`.
- **Why:** agents (and people) skip prose rules; a failing check can't be skipped.
- **Terms:** subpath imports.
- **Done when:** a file breaking each rule fails `pnpm lint`; the repo passes.

### 0.7 Structure + test rules
- **Build:** `rules.md` sections: folder layout per app (`features/<name>/`, `lib/`), what belongs in
  `packages/shared`, tests next to the code they test, the contract-first rule, and which kind of test to write.
- **Why:** one obvious place for everything keeps a growing codebase navigable for agents.
- **Terms:** testing trophy, colocation.
- **Done when:** `rules.md` has the Structure and Tests sections; existing code follows them.

### 0.8 Agent loop
- **Build:** Claude Code hooks: Biome on each edited file, checks before an agent stops; PR template section
  for changed or removed tests.
- **Why:** feedback inside the agent's loop is the cheapest place to catch a mistake.
- **Terms:** hook, feedback loop.
- **Done when:** a hook blocks an agent from stopping while lint or tests fail.
