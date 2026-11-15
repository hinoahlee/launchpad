# Phase 10 — VPS target (optional)

**Goal:** the same image on your VPS, deployed by CI.
**You'll need:** your VPS, a deploy SSH key. **Cost:** your existing VPS.

### 10.1 Publish to GHCR
- **Build:** the `publish` job also pushes `:<sha>` to GitHub Container Registry.
- **Terms:** GHCR, registry authentication.
- **Done when:** the package lists the SHA.

### 10.2 Compose + Caddy
- **Build:** `infra/vps/`: `compose.yml` (app + worker from the image, log rotation, ports bound to
  `127.0.0.1`), Caddy with automatic HTTPS for `vps.<domain>`, external network to the shared Postgres.
- **Terms:** reverse proxy, ACME, Docker network.
- **Ref:** turborepo / mixmallow `docker-compose.yml`.
- **Done when:** `https://vps.<domain>` serves.

### 10.3 Deploy over SSH
- **Build:** `deploy-vps.yml`: SSH as a restricted `deploy` user, pull the digest, migrate, `up -d`.
- 🧑 **You:** create the user and key; add the key as a GitHub Environment secret.
- **Terms:** SSH key pair, least-privilege user, `known_hosts`.
- **Done when:** a merge deploys to the VPS.

### 10.4 Backups
- **Build:** nightly `pg_dump` to an S3/R2 bucket with retention, plus a restore check in the runbook.
- **Done when:** a restore from the bucket works.
