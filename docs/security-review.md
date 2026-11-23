# Security review (step 14.2)

**Date:** 2026-11-23 · **Commit:** `d9f584d` · **Scope:** `apps/api`, `apps/web`, `packages/*`, CI, the image, and the
live site's headers. Read by hand; the scanners from 14.1 (CodeQL, Trivy, `pnpm audit`) were clean.

**Threat model, in one line:** an anonymous visitor or a signed-in user of *another* organization tries to read or
change your data, impersonate you, run up our bills, or knock the service over. We don't defend against someone who
already controls Render, GitHub, Stripe or the database.

**Result:** nothing critical or high. 3 medium, 4 low, 1 informational. M2 checked out fine. Fixing M1, M3, L1, L2,
L4 in 14.3–14.5; L3 and I1 accepted as they are.

## Findings

| # | Severity | Finding | Fix (estimate) |
|---|---|---|---|
| M1 | Medium | Sign-in code emails have no per-address limit | **Fixed in 14.4** (`sign-in-code-limit.ts`) |
| M2 | ~~Medium~~ | The real-client-IP setting was never checked in production | **Checked: correct.** No fix |
| M3 | Medium | An aborted request crashes the rate limiter (500 + Sentry event) | **Fixed in 14.3** |
| L1 | Low | Our own POST routes have no `Origin` check (same-site CSRF) | **Fixed in 14.3** (`lib/same-origin.ts`) |
| L2 | Low | An upload URL outlives a deleted file | **Fixed in 14.5** (`delete-file-object` job) |
| L3 | Low | Sign-in codes sit in plain text in `jobs.payload` | Drop the code from finished jobs, or accept |
| L4 | Low | The storage quota's row lock has no test | **Fixed in 14.5** (two-connection test) |
| I1 | Info | The app's database login owns the schema | Least-privilege role, later (AWS phases) |

### M1: sign-in code emails have no per-address limit
- **Where:** `features/auth/auth.ts` (`emailOTP`). Better Auth limits `send-verification-otp` to 3 a minute *per IP*
  (checked in its source: the key is IP + path), never per email address.
- **Attack:** a script on many IPs (a cheap proxy pool) asks for codes for `victim@example.com` over and over.
- **Impact:** the victim's inbox floods (email bombing); each email costs Resend quota; complaints and bounces hurt the
  sending domain's reputation, so real sign-in codes start landing in spam. Guessing codes stays impractical
  (3 tries per code, 1 in a million each).
- **Fix:** in `sendVerificationOTP`, count `send_email` jobs to that address in the last hour; over ~5, refuse with
  429. No new table: the jobs are already there.

### M2: the real-client-IP setting was never checked in production
- **Where:** `TRUST_PROXY_HOPS=2` on Render (`config.ts`), which every rate limit keys on (ours and Better Auth's).
- **Risk:** set too high, a client's own `X-Forwarded-For` value counts: anyone can pretend to be any IP and skip
  every limit. Set too low, every visitor looks like Cloudflare's or Render's address: one shared counter, so a
  single busy client locks *everyone* out of sign-in.
- **Check (🧑, 5 minutes):** sign in at https://launchpad.noahlee.xyz, then open
  https://launchpad.noahlee.xyz/api/account/sessions in the same browser. The `"current": true` session's
  `ipAddress` is the IP the app saw: it must equal your public IP (search "what is my IP"). Then do the same on your
  phone on mobile data: a different IP must show.
- **Result (2026-11-23):** the session showed the human's own public IP. And 106 requests to `/api/version`, each
  with a different fake `X-Forwarded-For`, got 100 × 200 then 6 × 429: the fake header is ignored, the real IP counts.

### M3: an aborted request crashes the rate limiter
- **Where:** `@fastify/rate-limit`'s key generator (`app.ts`). A client that disconnects early leaves `request.ip`
  undefined; the plugin throws, our handler logs `unhandled error` and reports it to Sentry (seen in 13.2).
- **Impact:** anyone can loop "open, send, hang up" to fill the Sentry quota (errors are counted per month); real
  errors then go unreported.
- **Fix:** a `keyGenerator` that falls back to the socket address, plus a test that aborts mid-request.

### L1: our own POST routes have no `Origin` check
- **Where:** `/api/organizations/:id/billing/{checkout,portal,sync}`, `/files/:id/complete`. Better Auth checks
  `Origin` on `/api/auth/*`; our routes don't.
- **Why it's only low:** other sites can't send the cookie (SameSite=Lax), and JSON bodies or `DELETE` need a CORS
  preflight we never allow. But a body-less POST from any `*.noahlee.xyz` subdomain counts as same-site: it carries
  the cookie with no preflight. Worst case today: a Stripe Checkout session created for you, which you never see.
- **Fix:** one `onRequest` hook on `/api`: state-changing methods must send an `Origin` equal to `APP_URL` (webhooks
  exempt; non-browser clients send none and use the bearer token).

### L2: an upload URL outlives a deleted file
- **Where:** `features/files/routes.ts`. The signed PUT URL is valid for 15 minutes. Deleting the file (or
  completing it) doesn't revoke it.
- **Impact:** within those 15 minutes, a member can PUT again: after a delete, the object comes back with no row
  (stored but uncounted by the quota, never cleaned up); after `complete`, the same-size content can be swapped.
- **Fix:** on delete, also queue a delete of the key that runs after the URL expires (as account deletion already does).

### L3: sign-in codes sit in plain text in `jobs.payload`
- **Where:** `send_email` jobs keep `props.code` until `prune-jobs` deletes them (failed jobs: forever). The
  `verifications` table stores only a hash.
- **Why it's only low:** a code dies after 5 minutes, and reading `jobs` needs database access. Worth a line in the
  code so nobody copies the pattern for a longer-lived secret. Fix is optional.

### L4: the storage quota's row lock has no test
- Ten parallel `app.inject` calls never raced (11.2). Without a test, a refactor could drop the lock and let two
  uploads at once exceed the quota. Fix: hold the lock from a second real connection in the test.

### I1: the app's database login owns the schema
- Render's default user can create and drop tables. No SQL injection was found (every query is parameterized by
  Drizzle), so this only matters if one appears. A separate role for migrations vs. the app comes with the AWS phases.

## Checked and fine
- **Sessions:** HttpOnly cookie, never exposed to browser JavaScript; bearer tokens must be signed; revoking a
  session takes effect on the next request (no cookie cache). Account deletion needs a session from the last 10 min.
- **Sign-in codes:** hashed at rest, 5-minute life, 3 guesses per code, same response whether the account exists.
- **CSRF on `/api/auth/*`:** Better Auth's `Origin` check is on in every environment, including tests.
- **Tenant isolation:** every org route runs `requireMembership` and filters on its organization; another org's
  ids give 404, not 403. Role checks (admin for delete, checkout, portal) are on the routes that spend or destroy.
- **Webhooks:** Stripe and Resend signatures checked on the raw bytes, timestamps older than 5 minutes refused,
  constant-time compare; Stripe events deduplicated and re-fetched, never trusted.
- **Storage:** presigned PUTs pin type and size; downloads are attachments from the bucket's own origin; keys are
  random, never the file name.
- **Injection:** all SQL through Drizzle parameters; no shell, `eval`, or file paths built from input.
- **Web app:** no `dangerouslySetInnerHTML`; the sign-in `redirect` accepts only paths on this site.
- **Headers (live):** strict CSP (no inline scripts or styles), HSTS, `frame-ancestors 'none'`, `nosniff`,
  `no-referrer`; HTTP redirects to HTTPS; errors return a code and request ID, never a message or stack.
- **Secrets:** none in git (only `.env.example`); logs redact auth headers and cookies; Sentry gets no user data.
- **Supply chain (14.1):** non-root image without npm; actions pinned to SHAs; read-only CI token by default.

## 🧑 Also look at
- Security → Secret scanning: it scanned the whole git history when you turned it on. Expect no alerts.
- Security → Dependabot: 2 moderate (`glob`, `minimatch`), build-time only, waiting on their parent packages.
