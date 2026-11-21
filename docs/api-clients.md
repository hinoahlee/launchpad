# Calling the API without a browser

The web app's session lives in an `HttpOnly` cookie. A mobile app or a script has no cookie jar, so it uses
the same session as a **bearer token**: it reads the token once, at sign-in, and sends it back on every request.
Same sign-in endpoints, same `sessions` rows. Revoking a session on the account page signs that client out too.

## Walkthrough with curl (local dev)

Start the app (`pnpm db:up`, `pnpm dev`), then in Git Bash (any POSIX shell). Requests go straight to the API
on port 3000. In production, use your app's URL.

```bash
API=http://localhost:3000/api

# 1. Ask for a code. In dev without Resend, the worker's log prints the email (with the code).
curl -s "$API/auth/email-otp/send-verification-otp" -H 'content-type: application/json' \
  -d '{"email":"you@example.com","type":"sign-in"}'

# 2. Sign in with it. The token is in the `set-auth-token` response header, not the body.
TOKEN=$(curl -s -D - -o /dev/null "$API/auth/sign-in/email-otp" -H 'content-type: application/json' \
  -d '{"email":"you@example.com","otp":"123456"}' | tr -d '\r' | sed -n 's/^set-auth-token: //ip')

# 3. Call a protected route with only the Authorization header.
curl -s "$API/account/sessions" -H "authorization: Bearer $TOKEN"

# 4. Sign out: the session row is deleted and the token stops working (401).
curl -s -X POST "$API/auth/sign-out" -H "authorization: Bearer $TOKEN"
```

## Rules for a client
- Send no `Origin` header. Better Auth checks `Origin` against `APP_URL` (CSRF protection) when one is sent.
- The token is `<token>.<signature>`. Send it exactly as received; the bare part before the dot is refused.
- Store it in the OS's **secure storage** (iOS Keychain, Android Keystore), never in plain files or logs: anyone
  holding it is signed in as you until it expires or is revoked.
- A 401 means the session is gone (expired, signed out, revoked): drop the token and sign in again.
- Browsers never receive `set-auth-token` (the API drops it when a request has `Sec-Fetch-Mode`, which every
  browser sends). Browser code keeps using the cookie.
