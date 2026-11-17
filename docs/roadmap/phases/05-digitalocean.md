# Phase 5 — DigitalOcean

**Goal:** `https://app.<domain>` on App Platform with Managed Postgres, deployed by CI from an image it built
once, with migrations before every release. All of it opt-in: a copy of the template without a DigitalOcean
account still passes CI. Why DigitalOcean: [decision 004](../../decisions/004-deploy-targets.md).
**You'll need:** a DigitalOcean account with Spaces, `doctl`, Terraform. **Cost:** ~$25–30/mo (app ~$5, Postgres
~$15, registry $0–5; Spaces already paid). Verify current prices in step 5.1.

### 5.1 🧑 Account + tools
- **You:** install `doctl` and Terraform; a DigitalOcean billing alert; a Spaces access key for Terraform state
  (state bucket only); a custom-scoped API token for Terraform. The agent gives click paths and checks today's
  prices, token scopes and whether DigitalOcean supports GitHub OIDC.
- **Terms:** API token, token scope, billing alert.
- **Done when:** `doctl account get` works.

### 5.2 Terraform bootstrap + checks
- **Build:** `infra/digitalocean/`: provider pinned, S3 backend in a private Spaces bucket (check its locking
  support), every account value a variable with an example `.tfvars`; CI runs `fmt -check`, `validate`, `tflint`
  when `infra/**` changes. Decision `005-terraform.md`.
- **Why:** state is Terraform's memory of what exists; it must be shared, private and recoverable.
- **Terms:** Terraform, provider, resource, state, backend, lock, plan vs. apply, module, variable, output.
- 🧑 **You:** run `terraform init` and `apply` (the agent shows the plan first).
- **Done when:** `terraform plan` shows no changes, and the infra CI job is green.

### 5.3 Registry + publish on `main`
- **Build:** Container Registry in Terraform with garbage collection; CI `publish` job (only on `main`, only when
  `vars.DO_REGISTRY` is set) pushes `:<sha>` and outputs the digest. Check the image fits the plan's storage.
- **Why:** one image, built once and identified by its digest, is what every release runs.
- **Terms:** container registry, image tag vs. digest, immutable tag, garbage collection.
- 🧑 **You:** add the API token as a GitHub Environment `production` secret; set the repo variables.
- **Done when:** `doctl registry repository list-tags` shows the SHA; a fork without the variables skips the job.

### 5.4 Managed Postgres
- **Build:** a Postgres 17 cluster (smallest size) in Terraform; an app database and user (not the admin);
  trusted sources limited to the app; TLS with the cluster's CA certificate in config.
- **Why:** backups, failover and patches become the provider's job; you keep the data model.
- **Terms:** managed database, trusted sources, TLS to the database, connection pooler.
- **Done when:** `psql` connects over TLS from your machine only while your IP is temporarily trusted.

### 5.5 App Platform + pre-deploy migrations
- **Build:** `digitalocean_app` in Terraform: web service from the registry image, health check `/api/ready`,
  a `PRE_DEPLOY` job running `node dist/migrate.js`, `DATABASE_URL` from the cluster, env from the deploy
  contract. Terraform ignores the image tag (CI owns it). Decision `006-expand-contract.md`.
- **Why:** migrations run once, before new code starts; old code must still work with the new schema.
- **Terms:** app spec, component, pre-deploy job, expand/contract, backward-compatible migration.
- **Done when:** the `ondigitalocean.app` URL serves; the deploy log shows migrate, then start.

### 5.6 Continuous deployment
- **Build:** `deploy` job after `publish`: point the app at the new digest, wait for the deployment to be
  active, fail the workflow if it isn't.
- **Terms:** continuous deployment, GitHub Environment, deployment gate.
- **Done when:** a merged change is live with no manual step, and a failing migration leaves the old version up.

### 5.7 Custom domain + TLS
- **Build:** `app.<domain>` in the app spec; CNAME in Cloudflare (DNS only); DigitalOcean issues the certificate.
- **Terms:** (from phase 3) CNAME, TLS certificate.
- 🧑 **You:** add the record (or approve the agent's exact values).
- **Done when:** `https://app.<domain>/api/ready` → 200.

### 5.8 Drill: backup + restore
- **Build:** `docs/runbooks/restore-database.md`, written while doing it: `pg_dump` the production database,
  restore it locally, compare row counts; then restore the cluster to a point in time as a new cluster (fork),
  check it, delete it.
- **Why:** a backup you've never restored is a hope, not a backup.
- **Terms:** logical vs. physical backup, point-in-time recovery (PITR), fork, RPO, RTO.
- **Done when:** both restores done and counts match.
