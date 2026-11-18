# 005 — Schema changes: expand/contract, every migration backward-compatible

**Status:** accepted · **Date:** 2026-11-18

## Context
Render runs `node dist/migrate.js` before the new release starts, and the old release keeps serving until the
new one passes its health check. For minutes, old code runs against the new schema; a rollback runs it there
for good, since migrations only go forward.

## Options
1. Change schema and code in one release (rename, drop, add NOT NULL) — simple, but the old release breaks.
2. Stop traffic while migrating — always correct, but every schema change is downtime.
3. Expand/contract — never break the release that's serving; costs two or three releases per breaking change.

## Decision
Option 3. Each migration only adds (tables, nullable or defaulted columns, indexes) or removes what no running
release reads. A rename is: add the new column, write both, backfill, read the new one, then drop the old.

## Consequences
Deploys and rollbacks need no downtime. Breaking changes take several PRs; each says which phase it is in.
