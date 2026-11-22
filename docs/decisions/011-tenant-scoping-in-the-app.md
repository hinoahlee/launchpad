# 011 — Tenant isolation in application code, not row-level security (yet)

**Status:** accepted · **Date:** 2026-11-22

## Context
Org-scoped data (files, and every table after them) must never reach another organization. Either the API
filters every query, or Postgres hides other organizations' rows itself with row-level security (RLS).

## Options
1. App-level: `requireMembership(minRole)` on every org-scoped route (non-member 404, low role 403), and every
   query filters on the membership's organization. Plain code, clear errors; one forgotten filter leaks.
2. RLS: a policy per table, matching `organization_id` against a setting the API puts on each transaction. A
   forgotten filter returns nothing. Needs a database role that isn't the tables' owner (owners skip policies),
   every query inside a transaction that sets the organization, and policies kept in step with migrations.

## Decision
Option 1. One person per organization (decision 010) keeps the risk small, and tests check both sides of every
route: another organization's URL, and another organization's ids in your own URL.

## Consequences
Every new org-scoped route needs the hook, the filter and both tests (CLAUDE.md says how). A route without the
hook fails closed (`membershipOf` throws). Revisit RLS when teams arrive or a second service reads the database.
