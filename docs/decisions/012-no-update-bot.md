# 012 — No update bot: Dependabot alerts and security fixes only

**Status:** accepted (replaces Renovate from step 2.4) · **Date:** 2026-11-23

## Context
Since 2.4, Renovate (Mend's GitHub app, with write access to the repo) opened weekly PRs to bump every dependency.
We'd rather rely on nothing outside GitHub, and keep routine upgrades a deliberate act.

## Options
1. Renovate — the most features, but a third-party app that can write to the repo; each copy must install it.
2. Dependabot version updates (`dependabot.yml`) — GitHub's own, but a steady stream of PRs to review.
3. Dependabot alerts + security updates only (two switches in Settings), routine upgrades by hand.

## Decision
3: GitHub tells us about known vulnerabilities and opens the fix; nothing else changes without us asking.

## Consequences
- Pinned actions, base images and packages age until someone bumps them (`pnpm outdated`, release notes).
- A security fix younger than `minimumReleaseAge` (7 days) fails `pnpm install` in CI: exclude its exact version.
- Revisit if upgrades lag behind (e.g. a monthly bump step in phase 15).
