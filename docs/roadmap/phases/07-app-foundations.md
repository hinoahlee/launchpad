# Phase 7 — App foundations

**Goal:** the patterns every feature reuses: an API contract, security headers, the web shell, e2e tests.

### 7.1 API contract
- **Build:** `packages/shared` with Zod request/response schemas; `fastify-type-provider-zod`; error handler
  returning `{ error: 'validation_failed', details }`.
- **Why:** one schema validates the request, types the handler and types the web client.
- **Terms:** API contract, schema validation, type provider, serialization.
- **Done when:** a sample endpoint has tests for success and validation failure.

### 7.2 Security headers + rate limiting
- **Build:** helmet with a strict CSP (`script-src 'self'`), compression, rate limiting on `/api` with a
  swappable store (memory for now), `trustProxy` per platform.
- **Terms:** Content Security Policy (CSP), XSS, HSTS, rate limiting, reverse proxy headers.
- **Done when:** headers verified with `curl -I`; rate limit test passes.

### 7.3 Web foundations
- **Build:** TanStack Router (file routes), TanStack Query, Tailwind + shadcn/ui, light/dark theme, page layout,
  API client that parses responses with the shared schemas.
- **Terms:** client-side routing, server state vs. client state, cache invalidation, design tokens.
- **Ref:** turborepo `apps/web`.
- **Done when:** the shell renders on the deployed app.

### 7.4 Public pages
- **Build:** landing, privacy, terms, 404; `src/lib/site.ts` for name/tagline/contact; mobile first, 44px touch
  targets.
- **Terms:** responsive design, breakpoint, touch target, safe area.
- **Done when:** pages look right on a phone and a desktop.

### 7.5 End-to-end tests
- **Build:** Playwright (mobile + desktop) in CI; a fixture that fails on any console error; smoke tests for
  the pages.
- **Terms:** end-to-end (E2E) test, flaky test, test pyramid.
- **Ref:** turborepo `e2e/`.
- **Done when:** E2E runs green in CI.
