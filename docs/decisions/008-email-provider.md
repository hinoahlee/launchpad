# 008 — Email provider: Resend

**Status:** accepted · **Date:** 2026-11-19

## Context
Transactional email needs a provider that inboxes trust (SPF, DKIM, DMARC on our domain). The template deploys
to Render, a VPS or AWS from one image, and must run with no account at all (decision 004).

## Options
1. Resend: one HTTPS call, works from any platform, free tier 3,000/month (100/day), Cloudflare DNS set up
   in one click. Costs more than SES at volume ($20/month for 50,000).
2. AWS SES: cheapest at volume (~$0.10 per 1,000), but needs an AWS account, IAM credentials and a request to
   leave its sandbox before sending to anyone. Too much setup before phase 17, and only natural on AWS.

## Decision
Resend, called with plain `fetch` (one request; no SDK). The deciding reason: it works the same on every
platform today, with the least setup.

## Consequences
Code depends on `EmailDriver`, not Resend: SES is one more adapter if volume or the AWS phases make it worth
it. We send from `mail.noahlee.xyz`, so its reputation stays apart from the root domain.
