# 003 — Render builds the Dockerfile

**Status:** accepted · **Date:** 2026-11-16

## Context
Render can run our app three ways: its native Node runtime, building our `Dockerfile`, or pulling a prebuilt
image from a registry. We have no registry yet (ECR comes in phase 6).

## Options
1. Native Node runtime: no Docker; but Render's build differs from AWS/VPS, breaking the deploy contract.
2. `runtime: docker`: same Dockerfile everywhere; Render rebuilds the image CI already built.
3. `runtime: image` from a registry: one artifact everywhere; needs a registry, push credentials, and a
   deploy hook, since `autoDeployTrigger: checksPass` doesn't apply to prebuilt images.

## Decision
Option 2. Same Dockerfile and contract as every platform, with Render's built-in "deploy after checks pass"
and no registry to run. The pinned base image and frozen lockfile keep Render's build close to CI's.

## Consequences
Two builds of one commit (CI, Render) instead of one artifact promoted. Revisit if they ever differ, or when
ECR exists and promoting one image becomes cheap.
