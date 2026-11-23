# 012 — Dependabot over Renovate for dependency updates

**Status:** accepted (replaces Renovate from step 2.4) · **Date:** 2026-11-23

## Context
Something must open PRs to bump npm packages (with a pnpm catalog), pinned actions and base images. Since 2.4,
Renovate did, as Mend's GitHub app with write access to the repo.

## Options
1. Renovate — more features (approval gate on the Dashboard, lockfile maintenance, adds digest pins), but a
   third-party app with write access, and each copy of the template must install it.
2. Dependabot — built into GitHub, nothing to install, alerts and updates in one place; fewer features.

## Decision
Dependabot: one less outside party that can write to the repo, and zero setup for copies of the template.

## Consequences
- No approval gate: Node and Postgres majors are ignored in `dependabot.yml` and upgraded by hand.
- No lockfile maintenance: deep dependencies move when a parent bumps, or via Dependabot security updates.
- The Postgres image in `cicd.yml`'s `services` isn't updated: keep it equal to `compose.dev.yml`'s.
