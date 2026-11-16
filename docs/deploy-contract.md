# Deploy contract

Every platform (Render, AWS, VPS) depends only on this page. If a platform needs something not listed here,
change this page first (with a decision note). Why one image: [decision 002](decisions/002-single-image.md).

| # | Promise | Where it's met |
|---|---|---|
| 1 | One image, non-root, `linux/amd64`. | `Dockerfile` (`USER node`). `--platform linux/amd64` is set in CI (phase 2). |
| 2 | `node dist/server.js` (the default `CMD`): SPA + `/api` on `$PORT`. | `server.ts`, `app.ts` |
| 3 | `node dist/worker.js`: background jobs. | `worker.ts` (stub: idles until phase 12) |
| 4 | `node dist/migrate.js`: apply migrations, exit 0/1; run once before new code starts. | `migrate.ts` (stub: validates config until phase 4) |
| 5 | Config from environment variables only; invalid config exits non-zero at boot. | `config.ts` (Zod). The server also refuses to boot in production without the SPA build. |
| 6 | `/api/health` = process alive. `/api/ready` = can serve traffic (checks the DB). | `app.ts`. `/ready` adds the DB check in phase 4. The image's `HEALTHCHECK` calls `/api/health`. |
| 7 | On `SIGTERM`: stop taking work, finish or hand back what's in flight, exit within 25 s. | `server.ts` (`app.close()`, 25 s timeout), `worker.ts` |
| 8 | JSON logs to stdout with a request ID; no secrets. | Fastify logger (`requestId`). Worker and migrate write JSON by hand until phase 5. |
| 9 | No local state: files go to the bucket, everything else to Postgres. | Nothing writes to disk; the code is read-only to `node`. Bucket in phase 15. |
| 10 | Migrations are backward compatible with the previous release (expand/contract). | From phase 4. |

## Environment variables

| Name | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | The image sets `production`. |
| `PORT` | `3000` | Platforms usually set it. |
| `LOG_LEVEL` | `info` | `fatal` … `trace`, or `silent`. |

New variables are added here in the same PR as `config.ts`.
