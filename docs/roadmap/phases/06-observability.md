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
- **Done when:** a failing check triggers an alert. Test it by pointing the monitor at `/api/nope` (404), then
  back. (A wrong `DATABASE_URL` doesn't work on Render: the bad deploy fails its health check and the old
  version keeps serving, so the site never goes down.)
- **Setup used:** Sentry → Monitors → Create Monitor → Uptime. `GET /api/ready`, every 1 min, 5 s timeout,
  down after 3 failures, project `launchpad-api`. The project's default alert emails on downtime issues.

### 6.4 Drill: first incident
- **Build:** the agent ships a bug on purpose. You follow `docs/runbooks/incident.md` (written in this step):
  alert → Sentry → logs → revert → five-line postmortem.
- **Why:** practice the loop calmly before it's real.
- **Terms:** incident, MTTR, blameless postmortem.
- **Done when:** the postmortem is in `docs/postmortems/`.
