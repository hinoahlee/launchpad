# Roadmap

A production-grade app template, built step by step. An agent builds each step as a small PR; you review it
like you're shadowing a principal engineer.

- **New here?** Read this page, then [setup.md](setup.md).
- **During a phase:** read only that phase's file in [phases/](phases/).
- **[rules.md](rules.md)** is for the agent. Skim it once so you know what to expect.

## Status

| # | Phase | Status |
|---|---|---|
| 0 | [Workspace](phases/00-workspace.md) | done |
| 1 | [Container](phases/01-container.md) | done |
| 2 | [Continuous integration](phases/02-ci.md) | done |
| 3 | [First deploy (Render)](phases/03-render.md) | done |
| 4 | [Render delivery](phases/04-render-delivery.md) | in progress |
| 5 | [Database](phases/05-database.md) | not started |
| 6 | [Observability](phases/06-observability.md) | not started |
| 7 | [App foundations](phases/07-app-foundations.md) | not started |
| 8 | [Background jobs](phases/08-jobs.md) | not started |
| 9 | [Email](phases/09-email.md) | not started |
| 10 | [Auth](phases/10-auth.md) | not started |
| 11 | [File storage](phases/11-storage.md) | not started |
| 12 | [Organizations](phases/12-organizations.md) | not started |
| 13 | [Billing](phases/13-billing.md) | not started |
| 14 | [Hardening + scale](phases/14-hardening.md) | not started |
| 15 | [Operations practice](phases/15-operations.md) | not started |
| 16 | [VPS target](phases/16-vps.md) | not started |
| 17 | [AWS foundation (optional)](phases/17-aws-foundation.md) | not started |
| 18 | [AWS staging (optional)](phases/18-aws-staging.md) | not started |
| 19 | [AWS data + operations (optional)](phases/19-aws-data-ops.md) | not started |
| 20 | [AWS production (optional)](phases/20-aws-prod.md) | not started |
| 21 | [Later: mobile, enterprise](phases/21-later.md) | — |

Follow-ups noticed along the way:
- None open.

## What we're building

A Fastify API and a React SPA in one container image, with Postgres, background jobs, email, auth (web now,
mobile later), organizations, file uploads and Stripe billing. It deploys to Render, a VPS or AWS from the
same image. Each platform is opt-in: the template runs and passes CI with no cloud account.

| Area | Choice |
|---|---|
| Code | TypeScript, Node 24, pnpm workspaces + Turborepo, Biome |
| API / web | Fastify + Zod / Vite + React, TanStack Router + Query, Tailwind + shadcn/ui |
| Data | PostgreSQL 17 + Drizzle; jobs queued in Postgres |
| Auth | Better Auth: sessions in Postgres; cookie on web, `Authorization` header on mobile |
| Services | Resend (email), R2 / S3 (files), Stripe (billing), Sentry (errors), Better Stack (uptime) |
| Hosting | Render (paid): web, worker, Postgres. Later: VPS, then AWS (optional) |
| Delivery | GitHub Actions is the only CI/CD: image to GHCR, deploy by digest; Cloudflare DNS; Terraform for AWS |

### One image, three platforms

```mermaid
flowchart LR
  pr["PR merged to main"] --> ci["CI: verify + build"]
  ci --> reg[("Image in GHCR")]
  reg --> render["Render: web + worker + Postgres"]
  reg -.-> vps["VPS: Compose + Caddy + Postgres"]
  reg -.-> aws["AWS: staging → approval → prod (optional)"]
```

### On Render

```mermaid
flowchart LR
  gh["GitHub Actions"] -- "deploy hook + digest" --> web
  user(["Browser / app"]) --> web["Render: web"]
  subgraph render["Render"]
    web --> db[("Render Postgres")]
    worker["Render: worker"] --> db
    pre["Pre-deploy: migrate"] --> db
  end
  user -. "direct upload" .-> r2[("Cloudflare R2")]
```

### Every step

```mermaid
flowchart LR
  a["Agent explains the step"] --> b["Agent builds on a branch"] --> c["Agent opens a PR"] --> d["You review + merge"] --> e["Next step"]
```

One session per phase, model Opus 5.5. To start any phase, open a new session in the repo and send
`Start phase N.`
