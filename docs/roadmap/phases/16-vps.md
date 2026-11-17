# Phase 16 — VPS target

**Goal:** the same image on any VPS, deployed by CI: a cheap home for toy and personal projects. It replaces App
Platform and Managed Postgres with containers you run yourself. Nothing here is DigitalOcean-specific except
the registry and bucket URLs, both variables.
**You'll need:** a VPS (yours is on DigitalOcean), a deploy SSH key. **Cost:** your existing VPS.

### 16.1 Compose + Caddy
- **Build:** `infra/vps/`: `compose.yml` with app, worker and Postgres 17 (named volume; or an existing shared
  Postgres container through an external Docker network), log rotation, ports bound to `127.0.0.1`; Caddy with
  automatic HTTPS for `vps.<domain>`; the image pulled from the registry by digest.
- **Terms:** reverse proxy, ACME, Docker network, registry authentication.
- **Ref:** turborepo / mixmallow `docker-compose.yml`.
- **Done when:** `https://vps.<domain>` serves.

### 16.2 Deploy over SSH
- **Build:** `deploy-vps.yml` (runs only when `vars.VPS_HOST` is set): SSH as a restricted `deploy` user, pull
  the digest, migrate, `up -d`, check `/api/ready`.
- 🧑 **You:** create the user and key; add the key as a GitHub Environment secret.
- **Terms:** SSH key pair, least-privilege user, `known_hosts`.
- **Done when:** a merge deploys to the VPS.

### 16.3 Backups
- **Build:** nightly `pg_dump` to an S3-compatible bucket (Spaces today) with retention; a VPS section in
  `restore-database.md`.
- **Why:** the database now lives on one disk you own; a backup must live somewhere else.
- **Done when:** a restore from the bucket works.
