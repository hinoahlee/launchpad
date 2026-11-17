# Phase 4 — Render delivery

**Goal:** GitHub builds the image once, publishes it to GHCR and tells Render to run that exact digest. Render
runs on paid plans with its own Postgres, ready for phase 5. Why: [decision 004](../../decisions/004-deploy-targets.md).
**You'll need:** a payment method on Render. **Cost:** ~$13/mo (web `0.5c-512mb` ~$7, Postgres `0.1c-256mb`
~$6); +~$7 when the worker arrives in phase 8. Verify current prices in 4.2.

### 4.1 Publish to GHCR
- **Build:** CI `publish` job (only on `main`, after `verify` and `image`): push `ghcr.io/<owner>/<repo>:<sha>`
  with `GITHUB_TOKEN`, output the digest. Nothing to configure in a fresh copy of the template.
- **Why:** one image, built once and identified by its digest, is what every release runs.
- **Terms:** container registry, GHCR, image tag vs. digest, package visibility.
- 🧑 **You:** make the package public (this repo is public), so Render pulls it with no credential.
- **Done when:** the package lists the SHA, and its digest matches the CI output.

### 4.2 Render runs the GHCR image
- **Build:** `render.yaml`: `runtime: image` from GHCR (default reference `:main`, which `publish` now also
  pushes), plan `0.5c-512mb` (paid; no spin-down). Check whether the runtime change needs a new service, and
  plan the switch so the domain keeps working.
- **Why:** Render runs the bytes CI tested instead of rebuilding them (decision 003's open issue).
- **Terms:** image-backed service, instance type, spin-down.
- 🧑 **You:** approve the cost; apply the Blueprint change in Render.
- **Done when:** the service runs the GHCR digest and answers instantly after 15+ idle minutes.

### 4.3 Continuous deployment from GitHub
- **Build:** `deploy` job after `publish`, in GitHub Environment `production`, only when its deploy-hook secret
  is set: call Render's deploy hook with `imgURL=…@sha256:<digest>`, poll `/api/version` until it reports the new
  commit (no Render API key needed), fail the job otherwise. Runnable by hand with an
  older digest: that is the rollback.
- **Why:** GitHub is the only CI/CD; Render only runs what it's told to.
- **Terms:** deploy hook, continuous deployment, GitHub Environment, `workflow_dispatch`, rollback.
- 🧑 **You:** copy the deploy hook URL into the `production` environment secret (the agent gives the name).
- **Done when:** a merge goes live with no Render-side trigger; a fork without the secret skips the job.

### 4.4 Render Postgres + pre-deploy step
- **Build:** a database in `render.yaml` (`0.1c-256mb`, Postgres 17 to match local, no external access);
  `DATABASE_URL` from it; `preDeployCommand: node dist/migrate.js` (still the config-checking stub).
- **Why:** the database and the migration slot exist before phase 5's code needs them, so `main` keeps
  deploying while it adds `DATABASE_URL` to config.
- **Terms:** managed database, internal vs. external URL, IP allow list, pre-deploy step.
- **Done when:** the deploy log shows the pre-deploy step, then start.

### 4.5 Drill: a failed deploy and a rollback
- **Build:** a PR whose image fails the health check; watch the `deploy` job fail and the old version keep
  serving; then run the deploy workflow by hand with the previous digest; revert.
- **Why:** you rehearse the new pipeline's failure path before trusting it.
- **Terms:** roll back vs. roll forward.
- **Done when:** both behave as described.
