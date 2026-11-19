# Deploy contract

Every platform (Render, VPS, AWS) depends only on this page. If a platform needs something not listed here,
change this page first (with a decision note). Why one image: [decision 002](decisions/002-single-image.md).

| # | Promise | Where it's met |
|---|---|---|
| 1 | One image, non-root, `linux/amd64`, published once per `main` commit as `ghcr.io/<owner>/<repo>:<sha>`; platforms run it by digest. | `Dockerfile` (`USER node`). `.github/workflows/cicd.yml` (`image` job, `platforms: linux/amd64`; `publish` job). |
| 2 | `node dist/server.js` (the default `CMD`): SPA + `/api` on `$PORT`. | `server.ts`, `app.ts` |
| 3 | `node dist/worker.js`: background jobs. Run as many as needed: each job goes to one worker. | `worker.ts` → `lib/jobs/worker.ts`: claims from the `jobs` table, wakes on `LISTEN jobs`, polls every 5 s. Also queues recurring jobs (`lib/jobs/schedules.ts`, cron in UTC); each run once, keyed in `jobs.key`. Serves no HTTP: platforms watch the process, not a probe, and deploy it after the server (once migrations ran). Render: `launchpad-worker` in the Blueprint. |
| 4 | `node dist/migrate.js`: apply migrations, exit 0/1; run once before new code starts. | `migrate.ts` → `runMigrations` (`packages/db`), which reads the SQL shipped inside `@launchpad/db` |
| 5 | Config from environment variables only; invalid config exits non-zero at boot. | `config.ts` (Zod). The server also refuses to boot in production without the SPA build. |
| 6 | `/api/health` = process alive. `/api/ready` = can serve traffic (checks the DB). `/api/version` = the build's commit. | `app.ts`. `/ready` runs `select 1` with a 2 s timeout → 503 `database_unavailable`. The image's `HEALTHCHECK` calls `/api/health`, so it fits the server only: a platform that runs it for the worker must turn it off there. |
| 7 | On `SIGTERM`: stop taking work, finish or hand back what's in flight, exit within 25 s. | `server.ts` (`app.close()`, 25 s timeout; closes the DB pool last), `worker.ts` (stops claiming, aborts the running handler, hands its job back; a handler still running after 20 s is left to its lease) |
| 8 | JSON logs to stdout with a request ID; no secrets. | One logger config (`apps/api/src/lib/logger.ts`, pino) for server, worker and migrate; secret fields redacted. The server writes one `request` line per request (method, route, url without query, status, durationMs, requestId); error bodies include `requestId`. |
| 9 | No local state: files go to the bucket, everything else to Postgres. | Nothing writes to disk; the code is read-only to `node`. Bucket in phase 11. |
| 10 | Migrations are backward compatible with the previous release (expand/contract). | [Decision 005](decisions/005-expand-contract.md). |
| 11 | Unexpected errors (5xx) go to Sentry when `SENTRY_DSN` is set, tagged with release (= `GIT_SHA`), environment and `requestId`. | `lib/sentry.ts`, the error handler in `app.ts`. Web: `apps/web/src/lib/sentry.ts`, DSN baked in at build (below). |
| 12 | The platform terminates TLS and sets `TRUST_PROXY_HOPS` to the number of proxies that append to `X-Forwarded-For`. The app sends security headers (CSP, HSTS), compresses responses and rate-limits `/api` per client IP (in memory, so per instance). | `app.ts` (helmet, compress, rate-limit; `trustProxy`). Render: 2, in the Blueprint. |

## Environment variables

| Name | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | The image sets `production`. |
| `PORT` | `3000` | Platforms usually set it. |
| `LOG_LEVEL` | `info` | `fatal` … `trace`, or `silent`. |
| `GIT_SHA` | `dev` | Baked into the image by CI (`--build-arg`; `unknown` if built without it); reported by `GET /api/version`. Platforms don't set it. |
| `DATABASE_URL` | required | `postgres://user:password@host:port/database`. A secret: the platform injects it (Render: `fromDatabase` in the Blueprint). |
| `DATABASE_DIRECT_URL` | `DATABASE_URL` | A URL straight to Postgres, for the worker (`LISTEN`) and migrate. Set it only when `DATABASE_URL` goes through a transaction-mode pooler (Render's pooled URL, port 6432). A secret, like `DATABASE_URL`. |
| `SENTRY_DSN` | unset (off) | The API's Sentry project DSN. Set in the platform (Render: `sync: false`). |
| `SENTRY_ENVIRONMENT` | `NODE_ENV` | The environment tag on errors; set it where `NODE_ENV=production` isn't the whole story (staging). |
| `DEBUG_ERROR_ROUTE` | `false` | `true` adds `GET /api/debug/error`, which throws. Only to check error reporting; turn it off after. |
| `TRUST_PROXY_HOPS` | `0` | Proxies in front of the app that append to `X-Forwarded-For` (Render: 2; Caddy on a VPS: 1). Too low: every visitor shares the proxy's IP and one rate limit. Too high: clients can fake their IP. |

New variables are added here in the same PR as `config.ts`.

## Build-time settings (CI → image)

The web bundle is built inside the image, so its settings are fixed when CI builds it, not when a platform
starts it. All are optional; unset means Sentry is off in the browser and no source maps are uploaded.

| GitHub name | Kind | Notes |
|---|---|---|
| `SENTRY_DSN_WEB` | variable | The web Sentry project's DSN. Public: every visitor's browser downloads it. |
| `SENTRY_ORG`, `SENTRY_PROJECT_WEB` | variables | Where the web source maps go (`launchpad-web`). |
| `SENTRY_AUTH_TOKEN` | secret | Uploads source maps on `main` builds; a BuildKit secret, never in a layer. |
