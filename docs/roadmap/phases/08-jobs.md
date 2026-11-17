# Phase 8 — Background jobs

**Goal:** work that runs outside requests, with retries and schedules, on every platform.

### 8.1 Jobs table + enqueue
- **Build:** `jobs` table; named job types each with a Zod payload; `enqueue(tx, type, payload)` inside the
  caller's transaction.
- **Why:** the job exists only if the data it's about was saved.
- **Terms:** queue, producer/consumer, transactional outbox.
- **Done when:** tests show a rolled-back transaction leaves no job.

### 8.2 Worker
- **Build:** claim with `FOR UPDATE SKIP LOCKED`, lease + fencing on attempts, exponential backoff, max
  attempts, `LISTEN/NOTIFY` wake-ups with a polling fallback, hand the job back on `SIGTERM`.
- **Terms:** at-least-once delivery, idempotency, lease, fencing token, exponential backoff.
- **Ref:** mixmallow `apps/api/src/transcode/queue.ts`, `worker.ts`, `test/transcode.test.ts`.
- **Done when:** tests cover exclusive claims, retries, lease expiry and a stale worker being fenced off.

### 8.3 Recurring jobs
- **Build:** cron-style schedules that fire once even with several workers.
- **Terms:** cron expression, scheduler, singleton job.
- **Done when:** a sample hourly job runs once per hour on the deployed app.

### 8.4 Run the worker on Render
- **Build:** a background worker in `render.yaml` from the same image, deployed by the same job (added now,
  not earlier: an idle stub would cost ~$7/mo);
  `DATABASE_DIRECT_URL` for `LISTEN` when a connection pooler is in front.
- **Terms:** worker process, connection pooler (transaction vs. session mode).
- **Done when:** the worker runs on Render and processes a job.
