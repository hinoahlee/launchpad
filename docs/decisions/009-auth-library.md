# 009 — Auth library: Better Auth

**Status:** accepted · **Date:** 2026-11-20

## Context
Sign-in must work the same for the web app (cookie) and a future mobile app (`Authorization` header), with
Google, email codes, and later Apple, Microsoft or passwords, all attached to one user.

## Options
1. Build our own, like turborepo (~580 lines for Google alone): full control, but every provider, the email-code
   flow, account linking, session revocation and CSRF checks are security code we write and maintain.
2. Hosted (Clerk, Auth0): least code, but users live on their servers and are billed per user.
3. Better Auth: an MIT library running inside our API, storing everything in our Postgres tables.

## Decision
Better Auth (3). Providers and plugins are config; sessions are database rows (revocable); one token works as a
cookie or a bearer header. Account linking keeps its default: a new method joins an existing user only when the
provider vouches for the email; no `trustedProviders`.

## Consequences
A critical path depends on its releases (we pin, and take security fixes quickly). Its tables and endpoint
shapes are its own; its errors are `{ message, code }`, not our `{ error }`. Leaving means migrating users and sessions.
