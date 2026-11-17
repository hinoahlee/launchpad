# Phase 14 — Hardening + scale

**Goal:** safe to run several instances under real load.

### 14.1 Shared rate-limit store
- **Build:** move the rate-limit store to Postgres (or Valkey if load tests demand it — decision).
- **Terms:** horizontal scaling, stateless service, shared state.

### 14.2 Several instances
- **Build:** run 2 web instances on Render, prove nothing breaks (sessions,
  rate limits, jobs), then scale back. Autoscaling comes with AWS (phase 20).
- **Terms:** horizontal vs. vertical scaling, stateless service.

### 14.3 Load test
- **Build:** k6 script against the deployed app (rate-capped);
  record p95 latency at a target request rate; find the bottleneck.
- **Terms:** throughput, latency percentile, bottleneck, saturation.

### 14.4 Edge protection
- **Build:** decide whether to put Cloudflare's proxy (free managed WAF rules + a rate rule) in front of
  Render; if yes, `trustProxy` and the real client IP. AWS WAF comes in phase 20.
- **Terms:** WAF, OWASP Top 10, bot traffic, proxied DNS.

### 14.5 Supply chain + scanning
- **Build:** Trivy (image + Terraform), CodeQL, GitHub Actions pinned to commit SHAs.
- **Terms:** SAST, CVE, SBOM, pinning.

### 14.6 SEO for public pages
- **Build:** prerender landing and legal pages with per-page `<title>`, description and Open Graph tags.
- **Terms:** prerendering, static site generation (SSG), Open Graph, crawler.
- **Done when:** `curl` of the landing page (no JavaScript) shows the tags.
