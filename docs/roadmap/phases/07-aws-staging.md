# Phase 7 — AWS staging

**Goal:** `https://staging.<domain>` served from ECS Fargate and deployed automatically.
**You'll need:** a Cloudflare API token (DNS edit, this zone). **Cost:** ~$35/mo while running. Tear down when
pausing for more than a few days (step 7.7).

### 7.1 Network
- **Build:** `modules/network`: VPC across 2 AZs, public + private subnets, no NAT gateway. Decision
  `006-no-nat.md`.
- **Why:** the private network everything lives in; skipping NAT saves ~$32/mo for staging.
- **Terms:** VPC, CIDR block, subnet, availability zone (AZ), route table, internet gateway, NAT gateway,
  security group.
- **Done when:** applied; the agent walks you through it in the console.

### 7.2 Certificate + DNS
- **Build:** `modules/certificate`: ACM certificate for `staging.<domain>`, DNS validation records written to
  Cloudflare by Terraform.
- **Terms:** ACM, DNS validation, SNI.
- **Done when:** the certificate is "Issued".

### 7.3 Load balancer
- **Build:** `modules/alb`: HTTPS listener, HTTP→HTTPS redirect, target group checking `/api/ready`, a rule
  that only accepts requests carrying CloudFront's secret header.
- **Terms:** application load balancer (ALB), listener, target group, health check, TLS termination.
- **Done when:** applied.

### 7.4 ECS service
- **Build:** `modules/service`: cluster, task execution role vs. task role, task definition (0.25 vCPU,
  0.5 GB), logs to CloudWatch (30 days), service with deployment circuit breaker + rollback, ECS Exec on.
  Terraform ignores the image (CI owns it).
- **Terms:** Fargate, task definition, task, service, desired count, rolling deployment, circuit breaker.
- **Done when:** a task is running and healthy.

### 7.5 CloudFront
- **Build:** `modules/cdn`: distribution with the ALB as origin, `/assets/*` cached, everything else passed
  through; `staging.<domain>` → CloudFront in Cloudflare (DNS only).
- **Terms:** CDN, edge location, origin, cache behavior, cache key.
- **Done when:** `https://staging.<domain>/api/health` → 200, and the ALB's own URL → 403.

### 7.6 Continuous deployment
- **Build:** reusable `deploy-aws.yml` (inputs: environment, digest): new task definition revision, update the
  service, wait until stable. Runs after `publish`.
- **Terms:** continuous delivery vs. continuous deployment, reusable workflow, GitHub Environment.
- **Done when:** a merged UI change is live on staging with no manual step.

### 7.7 Drills
- **Build:** (a) a broken image gets rolled back by the circuit breaker; (b) open a shell with
  `aws ecs execute-command`; (c) `docs/runbooks/teardown.md`: destroy staging and recreate it.
- **Terms:** immutable infrastructure, configuration drift.
- **Done when:** all three done.
