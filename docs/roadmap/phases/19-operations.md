# Phase 19 — Operations practice

**Goal:** practice the maintenance work that fills most of a live product's life.

### 19.1 Upgrade day
- **Build:** work through Renovate PRs, including one major upgrade with breaking changes.
- **Terms:** major version, changelog, deprecation, codemod.

### 19.2 Postgres major upgrade
- **Build:** upgrade staging's Postgres major version (RDS blue/green or Render's process); runbook.
- **Terms:** major upgrade, blue/green deployment, maintenance window.

### 19.3 Secret rotation
- **Build:** rotate the database password, auth secret and an API key without downtime; runbook.
- **Terms:** secret rotation, dual-secret window.

### 19.4 Game day
- **Build:** the agent injects two or three failures without telling you which; you diagnose with alerts, logs
  and Sentry; postmortems.
- **Terms:** game day, chaos engineering, mean time to detect (MTTD).

### 19.5 Starting a project from the template
- **Build:** `docs/runbooks/new-project.md`: rename, remove example features, create environments, first deploy.
- **Done when:** you follow it once on a throwaway project.
