# Phase 5 — Database

**Goal:** Postgres locally, in CI and on Render, with the schema in code and migrations applied before every
deploy. Render's database already exists (phase 4); this phase puts it to work.
**You'll need:** psql client. **Cost:** $0 on top of phase 4.

### 5.1 Local Postgres
- **Build:** `compose.dev.yml` (Postgres 17, named volume), `DATABASE_URL` in config and `.env.example`.
- **Why:** a real database locally, identical in version to production.
- **Terms:** container volume, connection string, environment variable.
- **Done when:** `docker compose -f compose.dev.yml up -d` and `psql $DATABASE_URL -c 'select 1'` work.

### 5.2 Schema + migrations
- **Build:** `packages/db`: Drizzle schema, client, `users` table (`id` uuid, `email` citext unique, `name`,
  timestamps with time zone, ms precision), scripts `db:generate|migrate|check|studio`; `migrate.ts` runs it.
- **Why:** the schema lives in code; every change is a reviewed, ordered SQL file.
- **Terms:** ORM, schema, migration, DDL, `citext`.
- **Ref:** turborepo `packages/db`.
- **Done when:** `pnpm db:migrate` creates the table; `pnpm db:check` passes.

### 5.3 API wiring + readiness
- **Build:** `db` on the app; `/api/ready` runs `select 1` with a short timeout (503 on failure); shutdown
  closes the pool.
- **Why:** a load balancer should stop sending traffic to an instance that can't reach its database.
- **Terms:** connection pool, timeout, HTTP 503.
- **Done when:** with Postgres stopped, `/api/ready` → 503 while `/api/health` → 200.

### 5.4 Test database
- **Build:** a test helper that refuses database names not ending in `_test` and builds the schema from
  migrations; truncate tables before each test; Postgres service container in CI; `db:check` in `verify`.
- **Why:** tests against the real database catch what mocks hide.
- **Terms:** service container, test isolation, factory.
- **Ref:** turborepo `@repo/db/testing`, `apps/api/test/setup.ts`.
- **Done when:** CI is green with DB tests.

### 5.5 Migrations on Render
- **Build:** the pre-deploy command from 4.4 now applies real migrations. Decision `005-expand-contract.md`.
- **Why:** migrations run once, before new code starts; old code must still work with the new schema.
- **Terms:** expand/contract, backward-compatible migration.
- **Done when:** the deploy log shows the migration applied, then start; `users` exists on Render.

### 5.6 Drill: backup + restore
- **Build:** `docs/runbooks/restore-database.md`, written while doing it: `pg_dump` the Render database,
  restore it locally, compare row counts; then a point-in-time recovery to a new database in Render, check it,
  delete it.
- **Why:** a backup you've never restored is a hope, not a backup.
- **Terms:** logical vs. physical backup, point-in-time recovery (PITR), RPO, RTO.
- **Done when:** both restores done and counts match.
