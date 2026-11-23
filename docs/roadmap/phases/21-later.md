# Phase 21 — Later (plan when you get here)

**Scale and edge** (moved from phase 14: worth it once there's real traffic)
- Rate limits in a shared store (Postgres, or Valkey if load demands it), so several instances count together.
- Run 2+ web instances and prove sessions, rate limits and jobs still work.
- A k6 load test: p95 latency at a target request rate, and the bottleneck.
- Cloudflare's proxy (managed WAF rules, a rate rule) in front of Render; then `trustProxy` and the real client
  IP, checked from a second network.
- A Sentry `tunnel` through our own `/api` route, so ad blockers don't hide browser errors (and the CSP drops
  Sentry's hosts).
- `react-email` ships its preview CLI as runtime dependencies (~67 MB in the image); revisit if it splits them.
- An append-only audit log of security events (sign-ins, account deletion, sessions revoked).

**SEO** (once there's a real product)
- Prerender landing and legal pages with per-page `<title>`, description and Open Graph tags.

**Mobile**
- Expo app in `apps/mobile`, reusing `packages/shared`.
- Better Auth's Expo client: same sessions, token kept in SecureStore.
- Sign in with Apple (the App Store requires it when offering Google sign-in, with some exceptions).
- Keep the API backward compatible (old app versions stay installed for months), or version it.
- Builds and store releases with EAS; push notifications as a job type.

**Enterprise**
- SSO per organization (SAML / OIDC); decide build vs. a provider.
- Audit log export; data retention settings.
- Package `infra/aws` so it can deploy into a customer's own AWS account.
