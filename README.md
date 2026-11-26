# launchpad

A production-ready web app template: a Fastify API and a React SPA in one container image, with Postgres,
background jobs, email, sign-in (email codes and Google), organizations, file uploads, Stripe billing, error
tracking, CI/CD and end-to-end tests. Every external service is optional: with no accounts at all, the repo
installs, tests, passes CI and runs. It deploys to Render out of the box and to anything that runs a container.

**Working on the code?** [docs/architecture.md](docs/architecture.md) maps the code; [docs/conventions.md](docs/conventions.md) has the conventions and how to add a feature.

## 1. Set up

Tools: Git and the GitHub CLI (`gh auth login`), Node 24 (e.g. `fnm install 24`), pnpm (`npm install -g pnpm`; on
Windows not Corepack, whose launcher hangs `turbo` on Ctrl+C), and Docker.

1. **Use this template** on GitHub, then clone your new repository.
2. Rename what names your product: `PRODUCT_NAME` in `packages/shared/src/constants.ts`;
   `apps/web/src/lib/site/constants.ts` (tagline, repo URL, a real `contactEmail`); the landing, privacy and terms
   pages in `apps/web/src/routes/`; names, image URL, domain and `EMAIL_FROM` in `infra/render/render.yaml`.
   Optionally the `@launchpad/*` package scope and the `launchpad` database name (search the repo).
3. Protect `main`: `gh api -X POST repos/<owner>/<repo>/rulesets --input .github/rulesets/main.json` (squash merges,
   required checks; see [.github/rulesets/README.md](.github/rulesets/README.md)). Turn on Dependabot and CodeQL in
   **Settings → Advanced Security**.

## 2. Develop locally

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # PowerShell: Copy-Item apps/api/.env.example apps/api/.env
pnpm db:up        # Postgres 17 in Docker on localhost:5433
pnpm db:migrate   # create the tables (again whenever a migration arrives)
pnpm dev          # http://localhost:5173 (web; /api proxied to :3000) + the worker
```

Sign in at <http://localhost:5173/sign-in> with any email: without an email provider, the worker prints the code in
the `pnpm dev` terminal. Before a PR: `pnpm verify`, plus `pnpm e2e` for UI or API changes (first time:
`pnpm --filter @launchpad/e2e exec playwright install chromium`).

Integrations (Resend, Google, S3, Stripe, Sentry) stay off until their variables are set in `apps/api/.env`.
**`apps/api/.env.example` documents every variable**: what it does, when it's needed, and local notes. Use
sandbox accounts and separate keys for development, never production's.

## 3. Deploy

### What any platform needs
- **The image** from GHCR, by digest (CI publishes `ghcr.io/<owner>/<repo>:<sha>` for each `main` commit;
  `linux/amd64`, non-root). Three commands:
  - `node dist/migrate.js` once per release, before new code starts (exit 0/1);
  - `node dist/server.js` (default): SPA + `/api` on `$PORT`;
  - `node dist/worker.js`: background jobs, one or more, no HTTP. Deploy it after the server, and turn off the
    image's `HEALTHCHECK` for it (that probe is the server's).
- **Probes**: `/api/health` (alive), `/api/ready` (can serve; checks the DB), `/api/version` (deployed commit).
- **PostgreSQL 17** as `DATABASE_URL`. Behind a transaction-mode pooler, also `DATABASE_DIRECT_URL` (worker, migrate).
- **TLS** at the proxy, and `TRUST_PROXY_HOPS` = proxies that append to `X-Forwarded-For` (Render 2, Caddy or an
  ALB 1). Too low and every visitor shares one rate limit; too high and clients can fake their IP.
- **Production config**: `APP_URL` (public origin), `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), plus any
  optional service. Invalid config exits at boot.
- **Shutdown**: SIGTERM with at least 25 s before SIGKILL. **No local disk**: files go to the bucket, the rest to Postgres.

Migrations must work with the previous release still running (expand/contract): only add, or remove what no running
release reads. A rename takes several PRs: add, write both, backfill, read the new one, drop the old.

### Render (the default)
Cost: about $7/month each for the web service and worker, plus about $6 for Postgres.
1. **Publish the first image**: merge anything to `main`. Then GitHub → Packages → the package → **Change
   visibility: Public** (Render pulls it without credentials).
2. **Blueprint**: Render → **New → Blueprint** → this repo, path `infra/render/render.yaml`. It creates the web
   service, worker and Postgres and generates `BETTER_AUTH_SECRET`; leave optional prompts empty for now.
3. **Domain**: a `CNAME` to the web service's `onrender.com` host, matching `domains` and `APP_URL` in the
   Blueprint. On Cloudflare, DNS only (grey cloud): proxying adds a hop `TRUST_PROXY_HOPS` doesn't count.
4. **Deploy from GitHub**: copy each service's **Deploy Hook**. In GitHub → **Environments** → `production`
   (branch `main` only), add secrets `RENDER_DEPLOY_HOOK_URL` and `RENDER_WORKER_DEPLOY_HOOK_URL`. Then under
   **Settings → Secrets and variables → Actions → Variables**, add the *repository* variable `RENDER_URL` =
   `https://<domain>` (not an environment variable: the workflows read it before the environment applies, and skip
   the deploy without it). Each merge to `main` now deploys (web first, migrations in its pre-deploy step, then the
   worker).
5. **Check**: `/api/ready` returns `{"status":"ok"}` and `/api/version` the commit.

Deploy only through GitHub from then on: save env edits in Render with **Save only**, then run the **Deploy to
Render** workflow (also how you roll back: run it with an older SHA).

### Other platforms
**VPS**: Docker Compose with server, worker, Postgres and Caddy; run migrate as a one-off `docker compose run` before
`up`; add `pg_dump` backups. **AWS**: ECS Fargate or App Runner for server and worker, a one-off task for migrate,
RDS, S3 with a task role (no keys), an ALB; copy `.github/workflows/deploy-render.yml` as the shape of the deploy job
(by digest, wait for `/api/version`, then the worker), with OIDC instead of keys. More than one API instance needs a
shared rate-limit store (`apps/api/src/http/rate-limit.ts`); workers scale freely.

### Optional services
Set each in the platform (Render dashboard), on the services `.env.example` names, then redeploy.
- **Email (Resend)**: verify a sending domain (a subdomain keeps its reputation apart), a "Sending access" key for
  it. Webhook `https://<domain>/api/webhooks/resend` with `email.bounced` and `email.complained`.
- **Google sign-in**: a Web OAuth client with redirect URI `https://<domain>/api/auth/callback/google`.
- **Files (any S3-compatible bucket)**: a private bucket and a key limited to it. Its CORS must allow the app's origin:
  `[{"AllowedOrigins":["https://<domain>"],"AllowedMethods":["PUT","GET"],"AllowedHeaders":["Content-Type"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]`.
  Upload failing? A CSP error in the browser console means `S3_ENDPOINT` is wrong; a CORS error means the origin
  doesn't match exactly.
- **Billing (Stripe)**: a product with a monthly price; a restricted key (write: Customers, Checkout Sessions,
  Customer portal; read: Subscriptions, Prices); the Customer Portal on; a webhook `https://<domain>/api/webhooks/stripe`
  for the events in `SYNC_EVENTS` (`apps/api/src/features/billing/webhook/constants.ts`).
- **Errors (Sentry)**: two projects. Platform: `SENTRY_DSN` (API). The web build reads GitHub Actions settings, baked
  in at build time: variables `SENTRY_DSN_WEB`, `SENTRY_ORG`, `SENTRY_PROJECT_WEB`, secret `SENTRY_AUTH_TOKEN`
  (source maps). Add an uptime monitor on `/api/ready`.

## 4. Call the API without a browser

Mobile apps and scripts use the same session as a bearer token. Sign in with
`POST /api/auth/email-otp/send-verification-otp` then `POST /api/auth/sign-in/email-otp`; the token comes back in the
`set-auth-token` response header. Send it as `Authorization: Bearer <token>`, exactly as received, with no `Origin`
header, and keep it in the OS's secure storage. A 401 means the session is gone: sign in again. Browsers never get
the header and keep using the cookie.

## 5. Operate it

- **Rollback**: revert the PR first, debug after. Deploys and rollbacks only go through GitHub Actions.
- **Backups**: Render Postgres has point-in-time recovery into a new database. Practise a restore before you need one.
- **Secrets**: rotate by adding the new value, deploying, then revoking the old. Changing `BETTER_AUTH_SECRET` signs
  everyone out.
- **Logs**: JSON lines on stdout; every error response and Sentry event carries the `requestId` to search for.
- **Before launch**: a real `contactEmail`, and your own privacy policy and terms. They should say that deleting an
  account deletes its Stripe customer, cancelling the subscription at once without a refund.
- **Known limits**: failed jobs are kept (`jobs.status = 'failed'`) but not retried or alerted on; a failed object
  delete is logged, not retried. A sign-in code is removed from `jobs.payload` once its email is sent or fails for good.

## License

MIT: see [LICENSE](LICENSE). An app you build from this template can use any license, as long as it keeps the MIT notice for the template's code.
