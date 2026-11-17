# 003 — Render builds the Dockerfile

**Status:** superseded by [004](004-deploy-targets.md) · **Date:** 2026-11-16

## Context
Render can run the native Node runtime, build our `Dockerfile`, or pull an image CI already built. Render has
no registry of its own; GitHub's (GHCR) is free today and CI could push to it with `GITHUB_TOKEN`.

## Options
1. Native Node runtime: no Docker, but Render's build differs from AWS/VPS and breaks the deploy contract.
2. `runtime: docker`: one YAML file, gated by `autoDeployTrigger: checksPass`; Render rebuilds what CI built.
3. CI pushes to GHCR, Render pulls (`runtime: image`): the exact bytes CI built run; needs a push step, a
   deploy job calling a Render deploy hook, and its secret (`checksPass` doesn't apply to image services).

## Decision
Option 2: fewest moving parts for our first deploy, and the same Dockerfile and contract as every platform.

## Consequences
Two builds of one commit can differ: the base image is pinned by tag, not digest, so a re-pushed tag reaches
Render without CI building it (npm packages are fixed by the lockfile). Revisit in phase 7, where one image
is built once and promoted.
