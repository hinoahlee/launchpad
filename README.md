# launchpad

A production-ready template for a web app: a Fastify API and a React SPA in one container image, with Postgres,
background jobs, email, sign-in (email codes and Google), organizations, file uploads, Stripe billing, error
tracking, CI/CD and end-to-end tests.

It is built to be portable. Everything a platform needs is in one image and a short list of commands, env vars
and probes ([docs/deploy-contract.md](docs/deploy-contract.md)): no platform SDKs, no local disk, config from the
environment only. The default target is Render (a Blueprint and a deploy workflow are included), but the same
image runs on a VPS (Docker Compose + a reverse proxy), on AWS (ECS/App Runner + RDS + S3) or on any container
platform. Every external service is optional: with no accounts at all, the repo installs, tests, passes CI and runs.

**Working on the code?** Read [CLAUDE.md](CLAUDE.md): commands, architecture, conventions and how to add a feature.
This README covers setting up and running the project.

- [1. Start a new project](#1-start-a-new-project)
- [2. Local development](#2-local-development)
- [3. Production (Render)](#3-production-render)
- [4. Other platforms (VPS, AWS)](#4-other-platforms-vps-aws)
- [5. Operating it](#5-operating-it)

## 1. Start a new project

### Tools
| Tool | Check |
|---|---|
| Git, and the GitHub CLI (`gh auth login`) | `gh auth status` |
| Node 24 (e.g. via fnm: `fnm install 24`) | `node -v` |
| pnpm, installed with `npm install -g pnpm` (on Windows, not Corepack: its launcher hangs `turbo` on Ctrl+C) | `pnpm -v` |
| Docker (Docker Desktop on macOS/Windows) | `docker version` |

### Make it yours
1. On GitHub: **Use this template** → a new repository (or clone and push to a new one). Then clone it.
2. Rename. Search the repo for `launchpad` and `Launchpad` and replace what names *your* product:
   - `PRODUCT_NAME` in `packages/shared/src/constants.ts` (header, page titles, emails, auth).
   - `apps/web/src/lib/site/constants.ts`: tagline, description, repo URL, a real `contactEmail`, `legalUpdated`.
   - `apps/web/src/routes/index.tsx`: the landing page (it describes the template); `privacy.tsx` and `terms.tsx`
     (starting points, not legal advice).
   - Package scope `@launchpad/*` (every `package.json` and import) and the `launchpad` database name/user in
     `compose.dev.yml`, `apps/api/.env.example`, `.github/workflows/cicd.yml` and `packages/db/src/testing/database.ts`:
     optional, but do it before your first deploy if you want to.
   - `infra/render/render.yaml`: service names, the image URL `ghcr.io/<owner>/<repo>:main`, your domain, `EMAIL_FROM`.
3. Protect `main`: `gh api -X POST repos/<owner>/<repo>/rulesets --input .github/rulesets/main.json` (squash merges
   only, `verify`, `e2e` and `image` checks required; notes in [.github/rulesets/README.md](.github/rulesets/README.md)). In
   **Settings → Advanced Security**, turn on Dependabot alerts and security updates, and CodeQL default setup.

## 2. Local development

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # PowerShell: Copy-Item apps/api/.env.example apps/api/.env
pnpm db:up        # Postgres 17 in Docker on localhost:5433 (data kept in a volume)
pnpm db:migrate   # create the tables (again whenever a migration arrives)
pnpm dev          # http://localhost:5173 (web; /api is proxied to the API on :3000) + the worker
```

Sign in at <http://localhost:5173/sign-in> with any email address: without an email provider, the worker prints
the email, code included, in the `pnpm dev` terminal. Before opening a PR, run `pnpm verify` (and `pnpm e2e` for UI
or API changes; the first time: `pnpm --filter @launchpad/e2e exec playwright install chromium`). All commands:
[CLAUDE.md](CLAUDE.md#commands).

Every integration below is off until its variables are set in `apps/api/.env` (each is documented in
`apps/api/.env.example`). Use test/sandbox accounts and separate keys for development, never production's.

| Integration | Set | Local notes |
|---|---|---|
| Email (Resend) | `RESEND_API_KEY`, `EMAIL_FROM` | Usually leave empty: emails are printed instead. |
| Google sign-in | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Redirect URI `http://localhost:5173/api/auth/callback/google`. |
| File uploads | `S3_*` | A dev bucket whose CORS allows `http://localhost:5173` (see [File storage](#file-storage)). |
| Billing (Stripe) | `STRIPE_API_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | Sandbox keys. Webhooks: `stripe listen` (command in `.env.example`). |
| Errors (Sentry) | `SENTRY_DSN` | Leave empty locally. |

## 3. Production (Render)

The pipeline: a PR runs CI (`verify`, `e2e`, `image`). A merge to `main` publishes the image to GitHub's registry
as `ghcr.io/<owner>/<repo>:<sha>`, then deploys that exact digest to Render: the web service first (its pre-deploy
step runs migrations, and the job waits until `/api/version` reports the new commit), then the worker. GitHub holds
only Render's deploy hooks, which can deploy nothing but this repository's image.

Cost on Render's paid plans: about $7/month each for the web service and the worker, plus about $6/month for
Postgres. Change plans and region in `infra/render/render.yaml` before the first sync (some can't change later).

### Steps
1. **Publish the first image.** Merge anything to `main` (or re-run CI on `main`): the `publish` job pushes the image.
   Then GitHub → your profile → **Packages** → the package → **Package settings** → **Change visibility: Public**
   (Render pulls it without credentials), and link it to the repository if it isn't.
2. **Create the Blueprint.** Render → **New → Blueprint** → this repository, Blueprint path
   `infra/render/render.yaml`. Render creates the web service, the worker and Postgres, and generates
   `BETTER_AUTH_SECRET`. Variables marked `sync: false` are prompted for: leave the optional ones empty for now.
3. **Domain.** Your DNS: a `CNAME` from your hostname to the web service's `onrender.com` host (on Cloudflare: DNS
   only, grey cloud). It must match `domains` and `APP_URL` in the Blueprint. `TRUST_PROXY_HOPS` is `2` for
   Cloudflare + Render's load balancer; use `1` without Cloudflare in front.
4. **Deploy from GitHub.** For each service, Render → **Settings → Deploy Hook** → copy. In GitHub → **Settings →
   Environments → New environment** `production` (deployment branches: `main` only), add secrets
   `RENDER_DEPLOY_HOOK_URL` (web) and `RENDER_WORKER_DEPLOY_HOOK_URL` (worker). Then **Settings → Secrets and
   variables → Actions → Variables**: `RENDER_URL` = `https://<your domain>`. The next merge deploys; to deploy now
   or roll back: Actions → **Deploy to Render** → Run workflow with a commit SHA from `main`.
5. **Check.** `https://<domain>/api/ready` answers `{"status":"ok"}` and `/api/version` the deployed commit.

From now on, deploy only through GitHub. In Render's dashboard, save env var edits with **Save only**, then run the
deploy workflow (a "save and deploy" uses `:main` and skips the web-before-worker order).

### Optional services
Each is off until configured. Set secrets in Render's dashboard (both services where noted), then redeploy.

**Email (Resend).** Add and verify a sending domain (a subdomain like `mail.example.com` keeps its reputation apart).
Create an API key with "Sending access" for that domain. Worker: `RESEND_API_KEY`, and `EMAIL_FROM` in the Blueprint
(`Name <hello@mail.example.com>`). Then Resend → **Webhooks** → endpoint `https://<domain>/api/webhooks/resend`,
events `email.bounced` and `email.complained`; web: `RESEND_WEBHOOK_SECRET` (`whsec_…`). Bounced and complaining
addresses are never emailed again.

**Google sign-in.** Google Cloud → **Google Auth Platform** → a Web client with redirect URI
`https://<domain>/api/auth/callback/google`. Web: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

<a id="file-storage"></a>**File storage (any S3-compatible bucket; Cloudflare R2 shown).** Create a private bucket
(e.g. `myapp-prod`). Its CORS policy must allow the app's origin:
```json
[{ "AllowedOrigins": ["https://<domain>"], "AllowedMethods": ["PUT", "GET"],
   "AllowedHeaders": ["Content-Type"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3600 }]
```
Create an API token with Object Read & Write on that bucket only. Web **and** worker: `S3_ENDPOINT`
(`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`), `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
(`S3_REGION` stays `auto` for R2). On AWS S3: no endpoint, the bucket's region, and keys optional (an IAM role works).
Uploads go browser ↔ bucket directly; the API only signs URLs. If uploads fail, the browser console says why:
a CSP error means `S3_ENDPOINT` is wrong; a CORS error means the bucket's `AllowedOrigins` doesn't match exactly.

**Billing (Stripe).** Create a product with a monthly price, and a restricted key with write access to Customers,
Checkout Sessions and Customer portal, read access to Subscriptions and Prices. Turn on the Customer Portal. Web:
`STRIPE_API_KEY` (`rk_…`), `STRIPE_PRICE_ID` (`price_…`). Then a webhook endpoint `https://<domain>/api/webhooks/stripe`
subscribed to the events in `SYNC_EVENTS` (`apps/api/src/features/billing/webhook/constants.ts`); web:
`STRIPE_WEBHOOK_SECRET`. Use a sandbox until launch.

**Error tracking (Sentry).** Two projects (API and web). Render, both services: `SENTRY_DSN` (the API project).
GitHub Actions variables: `SENTRY_DSN_WEB`, `SENTRY_ORG`, `SENTRY_PROJECT_WEB`, and secret `SENTRY_AUTH_TOKEN`
(uploads source maps on `main` builds). Add an uptime monitor on `https://<domain>/api/ready`.

## 4. Other platforms (VPS, AWS)

Anything that runs a Linux container can host it. Provide what [docs/deploy-contract.md](docs/deploy-contract.md) lists:
- The image from GHCR, by digest. Three commands: `node dist/migrate.js` once per release before the new code
  starts, `node dist/server.js` (HTTP on `$PORT`, health check `/api/ready`), `node dist/worker.js` (one or more; no HTTP).
- PostgreSQL 17 as `DATABASE_URL` (add `?sslmode=require` where the provider needs TLS). Behind a transaction-mode
  pooler (PgBouncer, RDS Proxy), also `DATABASE_DIRECT_URL` for the worker and migrations.
- TLS at the proxy or load balancer, `TRUST_PROXY_HOPS` = the number of proxies that append to `X-Forwarded-For`,
  `APP_URL`, `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), and the optional services' variables.
- SIGTERM with at least 25 s before SIGKILL.

**VPS:** Docker Compose with the server, the worker, Postgres and Caddy (TLS, `TRUST_PROXY_HOPS=1`); run migrate as a
one-off `docker compose run` before `up`. Add backups (`pg_dump` to off-site storage) yourself.
**AWS:** ECS Fargate (or App Runner) services for server and worker, a one-off ECS task for migrate, RDS Postgres,
S3 with a task role (no keys), an ALB (`TRUST_PROXY_HOPS=1`). Copy `.github/workflows/deploy-render.yml` as the shape
of a deploy job: deploy by digest, wait for `/api/version`, then the worker. Use OIDC for GitHub → AWS, not keys.

To scale the API beyond one instance, give the rate limiter a shared store (Redis; `apps/api/src/http/rate-limit.ts`):
its counters are in memory, per instance. Workers scale freely.

## 5. Operating it

- **Deploys and rollbacks** go through GitHub Actions only (Render: **Deploy to Render** with an older SHA). For a
  bug in production, revert the PR first and debug after.
- **Migrations** must keep working with the release before them (expand/contract): a rename or a new `NOT NULL`
  column takes several deploys. Review every generated SQL file.
- **Backups**: Render Postgres has point-in-time recovery (restores into a new database). Practise a restore before
  you need one. Never restore over the only copy.
- **Secrets**: rotate by adding the new value, deploying, then revoking the old. Changing `BETTER_AUTH_SECRET` signs
  everyone out.
- **Logs** are JSON lines on stdout with a `requestId`, which every error response and Sentry event also carries:
  search for it.
- **Before launch**: a real `contactEmail`; your own privacy policy and terms; live Stripe keys only after reviewing
  that deleting an account leaves its Stripe customer and subscription in place (delete them in `deleteUser`'s
  `beforeDelete` in `apps/api/src/lib/auth/create.ts`).
- **Known limits**: failed jobs (`jobs.status = 'failed'`, `last_error`) are kept but not retried or alerted on; an
  object whose delete failed is logged (`storage delete failed; object orphaned`) and not retried; sign-in codes stay
  in `jobs.payload` until `prune-jobs` removes done jobs (7 days); the app's database user owns the schema.
