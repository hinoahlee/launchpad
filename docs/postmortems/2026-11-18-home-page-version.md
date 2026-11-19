# 2026-11-18: home page version error (drill)

- What happened: the home page tried to show the API's version, failed, and stayed on "Version: …" for every visitor.
- Impact: every visitor, about 13 minutes (bug deployed 23:50 UTC, revert deployed 00:04 UTC). The site and API stayed up; uptime stayed green.
- Cause: the web app expected `{ version }` from `/api/version`, but the API sends `{ sha }`. Nothing checks that both sides agree, and the web app has no tests.
- Fix: reverted PR #42 (#43).
- Next time: shared request/response schemas used by both apps (step 7.1), so a mismatch fails `pnpm typecheck`. Also: route browser errors through our own domain (a Sentry tunnel), because ad blockers hid this error from Sentry at first.
