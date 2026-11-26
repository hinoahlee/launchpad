# launchpad

A full-stack web app template in a pnpm + Turborepo monorepo on Node 24 and TypeScript. `apps/api` is a Fastify 5 API
with Zod-typed routes, Better Auth, a Postgres job queue and a worker. `apps/web` is a Vite + React 19 SPA with
TanStack Router and Query, Tailwind 4 and shadcn/ui. `packages/db` holds the Drizzle ORM schema and migrations
(PostgreSQL 17); `packages/shared` holds the Zod API contract both apps import. Playwright e2e tests are in `e2e/`.
Biome formats and lints. Read [docs/architecture.md](docs/architecture.md) for the layout and features,
[docs/conventions.md](docs/conventions.md) for how code is written here, and [README.md](README.md) for setup,
env vars and deploys. [REVIEW.md](REVIEW.md) is what review checks.

## Checks
Postgres must be running for unit tests, e2e and the dev server: `pnpm db:up` (Docker), then `pnpm db:migrate`.
- `pnpm verify`: lint, typecheck, unit tests, failing fast. The Stop hook runs it.
- `pnpm lint` (Biome + `scripts/check-*.ts`), `pnpm format` (fixes), `pnpm typecheck`, `pnpm test`
- One test file: `pnpm --filter @launchpad/api exec vitest run <path>`
- `pnpm e2e`: builds, then Playwright (phone + desktop) against the production server; specs in `e2e/tests/`.
  One spec: `pnpm --filter @launchpad/e2e exec playwright test tests/<name>.spec.ts` after `pnpm build`.
  First time: `pnpm --filter @launchpad/e2e exec playwright install chromium`.
- `pnpm dev`: web on http://localhost:5173 (proxies `/api`), API on 3000, worker. Sign-in codes print in the worker log.
- `pnpm verify:ci`: verify plus build and the migrations check (what CI runs). No seed command exists.

## Rules
- Feature work happens in a worktree (`claude --worktree <name>`), never on `main` in the main checkout.
- Merging deploys to production: every PR must leave the app working for users. Keep unfinished user-facing
  parts unreachable (no link or route) until the PR that completes them, or behind a feature flag, off by default,
  when the change alters existing behaviour.
- Never edit generated files: `apps/web/src/components/ui/` (shadcn CLI), `apps/web/src/routeTree.gen.ts` (Vite),
  `pnpm-lock.yaml` (pnpm), `packages/db/migrations/` (`pnpm db:generate` writes new ones; applied ones never change).
- Never read or print `.env` files. New env vars go in `apps/api/src/config/schema.ts` and `apps/api/.env.example`.
- No-go without the user's explicit ask: `infra/`, `.github/`, `Dockerfile`, `scripts/check-*.ts`, auth and billing
  internals (`apps/api/src/lib/auth/`, `apps/api/src/features/billing/`), and new dependencies.
- Conventional Commits; one concern per PR; never merge a PR.
