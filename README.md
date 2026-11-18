# launchpad

A production-grade app template: Fastify API + React SPA in one container image, deployable to Render, a VPS or
AWS. Built step by step; see [docs/roadmap](docs/roadmap/README.md).

## Getting started
Needs Node 24, pnpm and Docker.
```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # local config (PowerShell: Copy-Item)
pnpm db:up        # local Postgres in Docker; keeps running in the background
pnpm db:migrate   # create the tables (again whenever a new migration arrives)
pnpm dev          # API + web app in watch mode
```
`pnpm verify` runs every check CI runs. More commands: [CLAUDE.md](CLAUDE.md#commands).
