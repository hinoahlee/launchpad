# Phase 14 — Security review

**Goal:** know where the codebase stands on security, and fix what matters, before building the real product.
Scaling, load tests, edge protection and SEO moved to [phase 21](21-later.md): no traffic yet to justify them.

### 14.1 Scanning + supply chain
- **Build:** CodeQL on every PR, Trivy on the image (and the Dockerfile) in CI, `pnpm audit` in CI. Dependabot replaces
  Renovate (decision 012). 🧑 Turn on secret scanning, push protection and Dependabot security updates; uninstall
  the Renovate app.
- **Terms:** SAST, image scanning, secret scanning, push protection.
- **Done when:** a PR runs all three scanners green, and each fails on a planted problem.

### 14.2 Codebase review
- **Build:** a read-through of auth and sessions, every route's permission checks, input validation, webhooks,
  signed storage URLs, CSP and headers, secrets, error responses. Output: `docs/security-review.md`, findings
  ranked by severity, with no code changes. 🧑 Pick which to fix.
- **Terms:** threat model, attack surface, OWASP Top 10.

### 14.3+ Fixes
- **Build:** one PR per group of findings picked in 14.2. Known already: an `Origin` check on our own
  state-changing routes (`SameSite=Lax` trusts every `*.noahlee.xyz` subdomain, 11.3); the crash in
  `@fastify/rate-limit`'s key generator when a client aborts early (13.2); a test for the quota's row lock (11.2).
