# CLAUDE.md

**Follow [docs/roadmap/rules.md](docs/roadmap/rules.md).** It defines how phases and steps run, the PR flow,
safety rules and code conventions. During a phase, read only that phase's file in `docs/roadmap/phases/`.

## Project map
- `docs/roadmap/`: the plan (`README.md` status table, `rules.md`, `phases/`)
- `docs/glossary.md`: every term introduced so far
- `docs/deploy-contract.md`: what every platform relies on (image, commands, env, probes, signals)
- `docs/decisions/`: decision notes (`NNN-title.md`, from `000-template.md`)
- `docs/runbooks/`: step-by-step procedures for operating production (e.g. `restore-database.md`)
- `.github/pull_request_template.md`: the PR description format
- `apps/api`: Fastify API. `config.ts` (env, Zod) → `app.ts` (`buildApp`, routes under `/api`) → `server.ts`
  (listen, signals). Dev runs `.ts` directly with Node; `pnpm build` bundles `server`, `worker`, `migrate`
  into `dist/` with tsdown.
- `apps/web`: Vite + React SPA. In dev, Vite proxies `/api` to the API (one origin, as in production).
- `packages/db`: Drizzle schema (`src/schema.ts`), client, `runMigrations`; SQL migrations in `migrations/`
  (generated, reviewed, committed; shipped inside the package). The API bundles its code; `apps/api/src/migrate.ts`
  is the one migrate entrypoint (deploy: `node dist/migrate.js`; dev: `pnpm db:migrate`). Test helpers
  (`@launchpad/db/testing`): `_test`-only guard, schema reset, `truncateAll`, factories like `insertUser`.
- `packages/tsconfig`: shared strict TS configs (`base.json` for Node, `react.json` for the web app)
- References (read-only): `../turborepo`, `../mixmallow`

## Commands
Run from the repo root.
```bash
pnpm install     # one install for every package
pnpm dev         # turbo: every app in watch mode
pnpm build       # turbo: build in dependency order (cached)
pnpm typecheck   # turbo: tsc in every package
pnpm lint        # biome check (lint + format check), no writes
pnpm format      # biome check --write: fix formatting and safe lint fixes
pnpm test        # turbo: tests in every package (needs `pnpm db:up`: tests use launchpad_test)
pnpm verify      # lint, then typecheck + test + build + db:check: "is this safe to merge?"
pnpm db:up       # start local Postgres (compose.dev.yml) and wait until it's ready
pnpm db:down     # stop it (data kept in the volume)
pnpm db:generate # schema.ts changed → write the next migration (review the SQL, commit it)
pnpm db:migrate  # apply migrations to DATABASE_URL (apps/api/.env); the same file deploys run
pnpm db:check    # fail if schema.ts has changes no migration covers
pnpm db:studio   # browse the database in the browser
```
Local config: each app's `.env` (copy of its `.env.example`), loaded by `pnpm dev` and the `db:*` scripts. Agents never read `.env`.

Shared versions live in the `catalog:` in `pnpm-workspace.yaml`; packages use `"catalog:"`.

## Git
- `main` is protected: every change is a branch `p<N>.<step>-<slug>` and a squash-merged PR.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:` ...). The agent never merges PRs.
