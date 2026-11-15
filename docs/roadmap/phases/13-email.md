# Phase 13 — Email

**Goal:** transactional email sent through jobs, from your domain, that lands in the inbox.
**You'll need:** a Resend account. **Cost:** $0 on the free tier.

### 13.1 Driver + templates
- **Build:** `EmailDriver` interface with an in-memory driver for tests; React Email templates (HTML + text);
  a `send_email` job type.
- **Why:** requests never wait on an email provider, and failed sends retry.
- **Terms:** transactional vs. marketing email, adapter pattern.
- **Done when:** tests assert on sent emails.

### 13.2 Provider + domain
- **Build:** Resend driver (works on every platform). Decision `NNN-email-provider.md` (Resend vs. SES).
- 🧑 **You:** add the domain in Resend and the DNS records in Cloudflare.
- **Terms:** SPF, DKIM, DMARC, sender reputation.
- **Done when:** a real email arrives, and its headers show SPF/DKIM/DMARC pass.

### 13.3 Bounces + suppression
- **Build:** webhook endpoint (signature verified) that records bounced or complaining addresses; sends to them
  are skipped.
- **Terms:** hard vs. soft bounce, spam complaint, webhook signature.
- **Done when:** tests cover suppression.
