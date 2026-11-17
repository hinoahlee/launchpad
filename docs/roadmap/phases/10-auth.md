# Phase 10 — Auth

**Goal:** sign-in that works the same way for the web app and a future mobile app.
**You'll need:** a Google Cloud OAuth client (step 10.2).

**Design:** Better Auth. One session model, stored in Postgres, for every client. The browser carries the
session token in an `HttpOnly` cookie; a mobile app sends the same token in an `Authorization` header. Same
endpoints, same flows, same tables. Decision `NNN-auth-library.md` (Better Auth vs. building our own).

### 10.1 Core
- **Build:** Better Auth with the Drizzle adapter (its tables migrate like ours), mounted at `/api/auth/*`;
  trusted origins; secure cookie settings; secret in config.
- **Terms:** session, session token, cookie attributes (`HttpOnly`, `Secure`, `SameSite`), CSRF.
- **Done when:** the auth tables exist and `/api/auth/ok` responds (verify the current endpoint name).

### 10.2 Google sign-in
- 🧑 **You:** create the OAuth client; add redirect URIs for local and `app.<domain>`.
- **Build:** Google provider; sign-in button; error states.
- **Terms:** OAuth 2.0, OpenID Connect (OIDC), authorization code flow, PKCE, redirect URI, scope, ID token.
- **Done when:** you sign in on the deployed app.

### 10.3 Email code sign-in
- **Build:** email OTP through the `send_email` job; attempt limits.
- **Terms:** one-time password (OTP), passwordless, brute-force protection.
- **Done when:** you sign in with a code from your inbox.

### 10.4 Protecting routes
- **Build:** `requireSession` (`onRequest` hook) for the API; route guard on the web; account page with
  sign-out and a list of active sessions you can revoke.
- **Terms:** authentication vs. authorization, 401 vs. 403, session revocation.
- **Done when:** tests prove 401 without a session, and that user A can't read user B's data.

### 10.5 Non-browser clients
- **Build:** bearer-token support; a short doc showing a client signing in and calling the API with only an
  `Authorization` header (this is what the mobile app will do).
- **Terms:** bearer token, secure storage (Keychain / Keystore).
- **Done when:** `curl` with a bearer token reaches a protected endpoint.

### 10.6 Account deletion
- **Build:** delete-account flow, with hooks later phases extend (files, billing).
- **Terms:** hard vs. soft delete, right to erasure (GDPR).
- **Done when:** deleting removes the user and their sessions.

### 10.7 Security review
- **Build:** run `/security-review`; fix findings.
- **Done when:** no open high-severity findings.
