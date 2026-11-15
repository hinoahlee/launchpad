# Phase 17 — Billing

**Goal:** Stripe subscriptions per organization, kept correct by webhooks.
**You'll need:** Stripe (test mode), Stripe CLI.

### 17.1 🧑 Stripe setup
- **You:** a product with a monthly price in test mode; API keys into secrets.
- **Terms:** product, price, customer, subscription, test mode.

### 17.2 Checkout + portal
- **Build:** Checkout and Customer Portal sessions for an organization; only owners/admins can manage billing.
- **Done when:** a test card subscribes an organization.

### 17.3 Webhooks
- **Build:** raw-body signature check; event ID recorded in the same transaction as the change; re-fetch the
  subscription from Stripe instead of trusting the payload.
- **Terms:** webhook, idempotency, at-least-once delivery, eventual consistency.
- **Ref:** turborepo `apps/api/src/billing/`, `test/billing.test.ts`.
- **Done when:** tests cover duplicate, out-of-order and mid-handler-crash deliveries.

### 17.4 Entitlements
- **Build:** a helper mapping plan → allowed features; gate one feature.
- **Terms:** entitlement, feature gating.
- **Done when:** a free org is blocked and a paid org isn't.

### 17.5 Drill
- **Build:** replay events with the Stripe CLI against staging; cancel a subscription and watch access change.
- **Done when:** both behave correctly.
