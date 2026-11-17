# Phase 15 — Operations practice

**Goal:** practice the maintenance work that fills most of a live product's life.

### 15.1 Upgrade day
- **Build:** work through Renovate PRs, including one major upgrade with breaking changes.
- **Terms:** major version, changelog, deprecation, codemod.

### 15.2 Postgres major upgrade
- **Build:** rehearse on a restored copy, then upgrade Render Postgres's major version (Render's process); runbook.
- **Terms:** major upgrade, blue/green deployment, maintenance window.

### 15.3 Secret rotation
- **Build:** rotate the database password, auth secret and an API key without downtime; runbook.
- **Terms:** secret rotation, dual-secret window.

### 15.4 Game day
- **Build:** the agent injects two or three failures without telling you which; you diagnose with alerts, logs
  and Sentry; postmortems.
- **Terms:** game day, chaos engineering, mean time to detect (MTTD).

### 15.5 Staging (optional, ~+$13/mo)
- **Build:** a staging service + database in `render.yaml` (compare Render's preview environments);
  `main` deploys to staging, and the same digest reaches production after your approval.
- 🧑 **You:** add yourself as required reviewer on the `production` GitHub Environment.
- **Terms:** promotion, build once / deploy many, approval gate, environment parity.
- **Done when:** one merge reaches production with the digest staging ran.

### 15.6 Starting a project from the template
- **Build:** `docs/runbooks/new-project.md`: rename, remove example features, turn on Render (Blueprint,
  deploy hook secret, R2 keys), first deploy. Or swap this repo's infra to a real app and tear launchpad down.
- **Done when:** you follow it once on a throwaway project.
