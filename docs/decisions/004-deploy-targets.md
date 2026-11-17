# 004 — Deploy targets: DigitalOcean first, VPS next, AWS optional

**Status:** accepted · **Date:** 2026-11-17 · Supersedes [003](003-render-builds-dockerfile.md)

## Context
Render's free plan expires Postgres after 30 days and has no pre-deploy step or object storage, so it would
need Neon and R2 beside it. Three platforms (Render, AWS, VPS) also triple the infra to maintain, for little
extra learning.

## Options
1. Render + Neon + R2: $0, but three providers and free-tier workarounds unlike a real app.
2. DigitalOcean (App Platform, Managed Postgres, Container Registry, Spaces): one provider, ~$25–30/mo.
3. AWS first: the deepest lessons, but ~$40–50/mo per environment and the most setup before any feature.

## Decision
Option 2 as the main target: it's the setup we'd pick for a real app. Then a VPS target (any provider; Postgres in
a container) for cheap personal projects, after the features. AWS comes last and is optional. Render is retired.
Every platform is **opt-in**: with no cloud account the repo installs, tests and passes CI; a deploy job runs only
when its GitHub variables are set, and infra code takes every account-specific value as a variable.

## Consequences
CI builds the image once and pushes it to a registry, so every platform runs those exact bytes (003's open issue).
DigitalOcean has no GitHub OIDC (verify in phase 5), so CI uses a scoped API token: weaker than AWS's keyless role.
Production only at first; staging is an optional step in phase 15. Cost is real: tear down or reuse after.
