# Phase 21 — Later (plan when you get here)

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
