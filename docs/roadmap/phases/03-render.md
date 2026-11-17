# Phase 3 — First deploy (Render)

> Phase 4 moves this service to a paid plan running images from GHCR
> ([decision 004](../../decisions/004-deploy-targets.md)).

**Goal:** a live HTTPS URL on Render that updates itself after CI passes on `main`.
**You'll need:** Render account, Cloudflare account + a domain. **Cost:** $0 (Render free plan; ~$7/mo for always-on) + domain.

### 3.1 🧑 Accounts
- **You:** create a Render account (connect GitHub, grant this repo only); create a Cloudflare account and buy a
  domain there (or move an existing domain's DNS to Cloudflare). The agent gives exact click paths.
- **Terms:** PaaS, registrar, nameserver, DNS zone.
- **Done when:** the domain shows "Active" in Cloudflare.

### 3.2 Blueprint
- **Build:** `infra/render/render.yaml`: web service built from the `Dockerfile`, health check `/api/ready`,
  auto-deploy only after CI checks pass (verify the current setting name in Render's docs). Decision
  `003-render-builds-dockerfile.md`.
- **Why:** the service is defined in code, so it's reviewable and reproducible.
- **Terms:** Infrastructure as Code (IaC), blueprint, health check, zero-downtime deploy.
- 🧑 **You:** create the Blueprint in the Render dashboard from the repo.
- **Done when:** the `onrender.com` URL serves the SPA and `/api/health`.

### 3.3 Custom domain + TLS
- **Build:** `render.<domain>` → Render (CNAME in Cloudflare, DNS only); Render issues the certificate.
- **Why:** how a name becomes a server, and how HTTPS gets a trusted certificate.
- **Terms:** DNS record (A, CNAME), TTL, TLS certificate, certificate authority, Let's Encrypt, proxied vs.
  DNS-only.
- 🧑 **You:** add the record (or approve the agent's exact values).
- **Done when:** `https://render.<domain>/api/health` → 200.

### 3.4 Drill: a bad deploy
- **Build:** a PR that makes `/api/ready` return 500. Merge it, watch Render refuse to switch traffic, then
  revert.
- **Why:** you learn what health checks protect you from before you need it.
- **Terms:** rollback, roll forward, revert commit.
- **Done when:** you watched the old version keep serving, and the revert deployed.
