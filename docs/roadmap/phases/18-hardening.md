# Phase 18 — Hardening + scale

**Goal:** safe to run several instances under real load.

### 18.1 Shared rate-limit store
- **Build:** move the rate-limit store to Postgres (or Valkey if load tests demand it — decision).
- **Terms:** horizontal scaling, stateless service, shared state.

### 18.2 Autoscaling (AWS)
- **Build:** API scales on CPU / requests; worker scales on queue depth (custom metric).
- **Terms:** horizontal vs. vertical scaling, target tracking, cooldown.

### 18.3 Load test
- **Build:** k6 script against staging; record p95 latency at a target request rate; find the bottleneck.
- **Terms:** throughput, latency percentile, bottleneck, saturation.

### 18.4 Web application firewall
- **Build:** AWS WAF on CloudFront with managed rules and a rate rule.
- **Terms:** WAF, OWASP Top 10, bot traffic.

### 18.5 Supply chain + scanning
- **Build:** Trivy (image + Terraform), CodeQL, GitHub Actions pinned to commit SHAs.
- **Terms:** SAST, CVE, SBOM, pinning.

### 18.6 SEO for public pages
- **Build:** prerender landing and legal pages with per-page `<title>`, description and Open Graph tags.
- **Terms:** prerendering, static site generation (SSG), Open Graph, crawler.
- **Done when:** `curl` of the landing page (no JavaScript) shows the tags.
