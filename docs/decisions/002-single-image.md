# 002 — One image for the API and the SPA

**Status:** accepted · **Date:** 2026-11-16

## Context
We deploy to Render, AWS and a VPS. The SPA could be shipped with the API or hosted apart (S3 + CloudFront).

## Options
1. SPA in S3 + CloudFront, API in a container: SPA survives API outages; two deploys that can drift, and two
   origins (CORS, cookie setup) unless CloudFront routes `/api`.
2. One image serving both: one artifact, one origin, the same on every platform; static files cost the API a
   little work.

## Decision
Option 2. Portability and a single version across platforms outweigh the outage benefit. Hashed assets are
`immutable`, so a CDN in front (CloudFront on AWS) serves them from the edge anyway.

## Consequences
Every platform runs one image built once in CI (`docs/deploy-contract.md`). Revisit if the SPA must stay up
while the API is down, or static traffic becomes a real load.
