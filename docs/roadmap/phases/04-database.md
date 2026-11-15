# Phase 4 — Database

**Goal:** Postgres locally, in CI and on Render, with migrations applied before every deploy.
**You'll need:** psql client. **Cost:** +~$6–7/mo (Render Postgres).

### 4.1 Local Postgres
- **Build:** `compose.dev.yml` (Postgres 17, named volume), `DATABASE_URL` in config and `.env.example`.
- **Why:** a real database locally, identical in version to production.
- **Terms:** container volume, connection string, environment variable.
- **Done when:** `docker compose -f compose.dev.yml up -d` and `psql $DATABASE_URL -c 'select 1'` work.

### 4.2 Schema + migrations
- **Build:** `packages/db`: Drizzle schema, client, `users` table (`id` uuid, `email` citext unique, `name`,
  timestamps with time zone, ms precision), scripts `db:generate|migrate|check|studio`; `migrate.ts` runs it.
- **Why:** the schema lives in code; every change is a reviewed, ordered SQL file.
- **Terms:** ORM, schema, migration, DDL, `citext`.
- **Ref:** turborepo `packages/db`.
- **Done when:** `pnpm db:migrate` creates the table; `pnpm db:check` passes.

### 4.3 API wiring + readiness
- **Build:** `db` on the app; `/api/ready` runs `select 1` with a short timeout (503 on failure); shutdown
  closes the pool.
- **Why:** a load balancer should stop sending traffic to an instance that can't reach its database.
- **Terms:** connection pool, timeout, HTTP 503.
- **Done when:** with Postgres stopped, `/api/ready` → 503 while `/api/health` → 200.

### 4.4 Test database
- **Build:** a test helper that refuses database names not ending in `_test` and builds the schema from
  migrations; truncate tables before each test; Postgres service container in CI; `db:check` in `verify`.
- **Why:** tests against the real database catch what mocks hide.
- **Terms:** service container, test isolation, factory.
- **Ref:** turborepo `@repo/db/testing`, `apps/api/test/setup.ts`.
- **Done when:** CI is green with DB tests.

### 4.5 Render Postgres + pre-deploy migrations
- **Build:** database in `render.yaml`, `DATABASE_URL` from it, pre-deploy command `node dist/migrate.js`.
  Decision `004-expand-contract.md`.
- **Why:** migrations run once, before new code starts; old code must still work with the new schema.
- **Terms:** pre-deploy step, expand/contract, backward-compatible migration.
- **Done when:** Render's deploy log shows migrate, then start.

### 4.6 Drill: backup + restore
- **Build:** `docs/runbooks/restore-database.md`, written while doing it: `pg_dump` the Render database,
  restore it locally, compare row counts; note what Render's own backups offer.
- **Why:** a backup you've never restored is a hope, not a backup.
- **Terms:** logical vs. physical backup, point-in-time recovery (PITR), RPO, RTO.
- **Done when:** restored locally and counts match.
