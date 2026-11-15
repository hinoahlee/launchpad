# Phase 5 — Observability

**Goal:** you hear about problems before users do, and can find the cause quickly.
**You'll need:** Sentry and Better Stack accounts (free). **Cost:** $0.

### 5.1 Searchable logs
- **Build:** one log line per request (method, route, status, duration, request ID), secrets redacted; error
  responses include the request ID.
- **Why:** when a user reports "it broke", the request ID leads you to the exact log lines.
- **Terms:** structured logging, correlation ID, log level, redaction.
- **Done when:** you find one request in Render's logs by its ID.

### 5.2 Error tracking
- **Build:** Sentry in API and web; release = git SHA; environment tag; source maps uploaded in CI; disabled
  when no DSN is set.
- **Why:** errors arrive grouped, with stack traces and the release that introduced them.
- **Terms:** error tracking, release, source map, sampling.
- 🧑 **You:** create two Sentry projects; add the DSNs in Render.
- **Done when:** a test error shows a readable stack trace and the commit SHA.

### 5.3 Uptime + alerts
- **Build:** nothing in code. 🧑 **You:** a Better Stack monitor on `/api/ready` that alerts you by email/phone.
- **Why:** the simplest signal that matters: can users reach it?
- **Terms:** uptime check, synthetic monitoring, alert fatigue, SLO.
- **Done when:** suspending the Render service triggers an alert.

### 5.4 Drill: first incident
- **Build:** the agent ships a bug on purpose. You follow `docs/runbooks/incident.md` (written in this step):
  alert → Sentry → logs → revert → five-line postmortem.
- **Why:** practice the loop calmly before it's real.
- **Terms:** incident, MTTR, blameless postmortem.
- **Done when:** the postmortem is in `docs/postmortems/`.
