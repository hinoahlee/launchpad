# Phase 6 — Observability

**Goal:** you hear about problems before users do, and can find the cause quickly.
**You'll need:** a Sentry account (free Developer plan: errors plus 1 uptime monitor). **Cost:** $0.

### 6.1 Searchable logs
- **Build:** one log line per request (method, route, status, duration, request ID), secrets redacted; error
  responses include the request ID.
- **Why:** when a user reports "it broke", the request ID leads you to the exact log lines.
- **Terms:** structured logging, correlation ID, log level, redaction.
- **Done when:** you find one request in Render's logs by its ID.

### 6.2 Error tracking
- **Build:** Sentry in API and web; release = git SHA; environment tag; source maps uploaded in CI; disabled
  when no DSN is set.
- **Why:** errors arrive grouped, with stack traces and the release that introduced them.
- **Terms:** error tracking, release, source map, sampling.
- 🧑 **You:** create two Sentry projects. The API DSN goes in Render (`sync: false`); the web DSN, org, project
  and an auth token go in GitHub (the web bundle is built in CI, so Render's variables can't reach it).
- **Done when:** a test error shows a readable stack trace and the commit SHA.

### 6.3 Uptime + alerts
- **Build:** nothing in code. 🧑 **You:** a Sentry uptime monitor on `/api/ready` that alerts you by email (and
  the Sentry mobile app). One account for errors and uptime; a phone-call/on-call tool (Better Stack,
  PagerDuty) is for when a team shares the pager.
- **Why:** the simplest signal that matters: can users reach it?
- **Terms:** uptime check, synthetic monitoring, alert fatigue, SLO.
- **Done when:** making `/api/ready` fail (a temporarily wrong `DATABASE_URL`) triggers an alert.

### 6.4 Drill: first incident
- **Build:** the agent ships a bug on purpose. You follow `docs/runbooks/incident.md` (written in this step):
  alert → Sentry → logs → revert → five-line postmortem.
- **Why:** practice the loop calmly before it's real.
- **Terms:** incident, MTTR, blameless postmortem.
- **Done when:** the postmortem is in `docs/postmortems/`.
