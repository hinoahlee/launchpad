# Phase 14 — Security review

**Goal:** know where the codebase stands on security, and fix what matters, before building the real product.
Scaling, load tests, edge protection and SEO moved to [phase 21](21-later.md): no traffic yet to justify them.

### 14.1 Scanning + supply chain
- **Build:** CodeQL on every PR (GitHub default setup), Trivy on the image (and the Dockerfile) in CI, `pnpm audit` in CI, a 7-day
  `minimumReleaseAge` in pnpm, CodeQL required to merge. Renovate removed (decision 012). 🧑 Turn on CodeQL default
  setup, secret scanning, push protection, Dependabot security updates; uninstall the Renovate app.
- **Terms:** SAST, image scanning, secret scanning, push protection.
- **Done when:** a PR runs all three scanners green, and each fails on a planted problem.

### 14.2 Codebase review
- **Build:** a read-through of auth and sessions, every route's permission checks, input validation, webhooks,
  signed storage URLs, CSP and headers, secrets, error responses. Output: `docs/security-review.md`, findings
  ranked by severity, with no code changes. 🧑 Pick which to fix.
- **Terms:** threat model, attack surface, OWASP Top 10.

### 14.3 Request hardening (M3, L1)
- **Build:** the rate limiter survives aborted requests; an `Origin` check on our own state-changing routes.
- **Terms:** CSRF (again), defence in depth.

### 14.4 Sign-in code limit per address (M1)
- **Build:** at most a few sign-in codes per email address per hour, on top of Better Auth's per-IP limit.
- **Terms:** email bombing.

### 14.5 File cleanup + quota test (L2, L4)
- **Build:** a deleted file's key is deleted again after its upload URL expires; a test that holds the quota lock
  from a second connection.
