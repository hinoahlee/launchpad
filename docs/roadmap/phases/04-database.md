# Phase 4 — Database

**Goal:** Postgres locally and in CI, with the schema in code and the API's readiness tied to it. Production
Postgres comes in phase 5.
**You'll need:** psql client. **Cost:** $0.

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
