# 001 — One monorepo: pnpm workspaces + Turborepo + Biome

**Status:** accepted · **Date:** 2026-11-15

## Context

API, web app, worker and shared packages must share types and ship in one image, with one place to run checks.

## Options

1. Separate repos per app: clean boundaries, but versions drift and a change across API + web needs two PRs.
2. npm/Yarn workspaces: fine, but slower installs and no catalog for shared versions.
3. pnpm workspaces + Turborepo: strict installs, one lockfile, a catalog, and cached tasks in dependency order.

## Decision

Option 3. Biome with defaults for lint + format (one fast tool, no style debates). Exact versions in the
catalog. TypeScript 7 (the native compiler, ~10x faster checks); fall back to 6.x if a tool needs the old JS API.

## Consequences

One `pnpm install`, one `pnpm verify`. Upgrades are explicit PRs. Turborepo is one more tool to learn.
