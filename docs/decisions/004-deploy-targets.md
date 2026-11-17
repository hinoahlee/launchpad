# 004 — Deploy targets: Render paid, images from GHCR, deploys from GitHub

**Status:** accepted · **Date:** 2026-11-17 · Supersedes [003](003-render-builds-dockerfile.md)

## Context
Render's free plan expires Postgres after 30 days and has no pre-deploy step. We also planned three equal
platforms (Render, AWS, VPS), which triples the infra to maintain. We want the setup we'd pick for a real app.

## Options
1. Render free + Neon + R2: $0, but free-tier workarounds unlike a real app.
2. Render paid + Render Postgres + R2: ~$13–20/mo, two providers; Render has no object storage.
3. DigitalOcean (App Platform, Postgres, registry, Spaces): one provider, ~$25–30/mo; more setup.

## Decision
Option 2. CI builds the image once and pushes it to GHCR; a GitHub job deploys that digest through Render's
deploy hook, so GitHub is the only CI/CD. Files go to Cloudflare R2 (S3 API). A VPS target follows the
features; AWS comes last and is optional. Every platform is **opt-in**: with no accounts the repo installs,
tests and passes CI; deploy jobs run only when their secrets or variables are set.

## Consequences
Render runs the exact bytes CI tested. A leaked deploy hook can only redeploy our own images. Render stays
configured by `render.yaml` (Blueprint sync); only image deploys move to GitHub.
