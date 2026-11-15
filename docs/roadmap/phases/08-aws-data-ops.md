# Phase 8 — AWS data + operations

**Goal:** RDS behind staging, migrations in the pipeline, alarms that email you, and a restore you've done.
**Cost:** +~$15/mo while running.

### 8.1 RDS
- **Build:** `modules/database`: Postgres 17 in private subnets, reachable only from ECS tasks, encrypted,
  SSL required, 7-day backups. `DATABASE_URL` in Secrets Manager, injected into the task.
- **Terms:** RDS, parameter group, Secrets Manager, encryption at rest vs. in transit.
- **Done when:** `/api/ready` on staging → 200, and the database has no public endpoint.

### 8.2 Migrations in the pipeline
- **Build:** `deploy-aws.yml` runs `node dist/migrate.js` as a one-off task, and fails the deploy on a non-zero
  exit before touching the service.
- **Terms:** one-off task, exit code, deployment gate.
- **Done when:** a deliberately failing migration stops the deploy, and the old version keeps serving.

### 8.3 Alarms + dashboard
- **Build:** `modules/alarms`: SNS email topic; alarms for 5xx rate, p95 latency, unhealthy targets, CPU and
  memory, RDS CPU, storage and connections; one dashboard.
- **Terms:** metric, alarm, threshold, p95/p99, the four golden signals.
- 🧑 **You:** confirm the SNS email subscription.
- **Done when:** scaling the service to 0 sends you an email.

### 8.4 Drill: point-in-time restore
- **Build:** restore RDS to a new instance at a chosen minute, point staging at it, check the data, delete the
  copy. Add an RDS section to `restore-database.md`.
- **Terms:** PITR, snapshot, RPO, RTO.
- **Done when:** done end to end.
