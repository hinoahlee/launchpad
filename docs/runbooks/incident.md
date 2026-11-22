# Incident

Something is broken for users. Goal: users OK again as fast as possible. Understanding why comes after.

**Rule of thumb: if the last deploy might have caused it, revert first, debug later.**

## 1. Note the time
Write down when the alert arrived (or when you noticed). You'll need it for the postmortem.

## 2. How bad is it?
- Open the site: <https://launchpad.noahlee.xyz>. What does a user see?
- Sentry → **Monitors → Uptime**: is `/api/ready` red? If yes, the whole site is down.
- Green uptime doesn't mean all is fine: it only checks one URL.

## 3. Sentry: what broke, and since when?
Sentry → **Issues**, newest first. Open the issue:
- **Project:** `launchpad-web` = the browser, `launchpad-api` = the server.
- **Release:** the commit it started in. Compare with the latest deploy (`/api/version`).
- **Stack trace:** the file and line.
- **Events / users:** how many people hit it.
- **`requestId` tag** (API issues): copy it for step 4.

## 4. Render logs: what does the server say?
Render → **launchpad** → **Logs**:
- API issue: search the `requestId`. You'll see the request line and the error with its stack.
- Web issue: search `"status":5`. No 5xx lines means the API is fine and the bug is in the browser code.

## 5. Fix: revert
1. Find the PR that introduced it (the release SHA → GitHub → the commit → its PR).
2. On the PR page click **Revert**. GitHub opens a new PR that undoes it.
3. Wait for CI, merge it, wait for the deploy (`/api/version` shows the new SHA).

Faster stopgap while CI runs: Render → **launchpad** → **Events**, pick the last good deploy → **Rollback**. It
doesn't change `main`, so still merge the revert.

## 6. Check it's fixed
- The site works again.
- The Sentry issue gets no new events. Then mark it **Resolved**.
- Uptime is green.
- Note the time: from the alert to now is your **time to recover**.

## 7. Postmortem (same day)
New file `docs/postmortems/YYYY-MM-DD-<slug>.md`, five lines:
```
- What happened: <one sentence a user would understand>
- Impact: <who, how many, how long: alert at HH:MM, fixed at HH:MM>
- Cause: <the actual mistake, not who made it>
- Fix: <what made it stop>
- Next time: <one change that catches it earlier: a test, a check, an alert>
```
Blameless: write about the system (what let the mistake through), not the person.
