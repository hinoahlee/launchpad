# Phase 20 — AWS production (optional)

**Goal:** prod runs the exact image staging verified, after your approval, with a one-click rollback.
**Cost:** roughly doubles AWS while prod is up. You'll tear it down at the end.

### 20.1 Prod environment
- **Build:** `envs/prod` calling the same modules; deletion protection on RDS; `aws.<domain>`; bootstrap,
  OIDC role and ECR in the prod account.
- 🧑 **You:** apply; create GitHub Environment `production` with yourself as required reviewer.
- **Terms:** environment parity.
- **Done when:** `https://aws.<domain>` serves.

### 20.2 Promotion
- **Build:** after staging deploys, CI waits for your approval, copies the same digest to prod ECR, migrates,
  deploys.
- **Terms:** promotion, build once / deploy many, approval gate.
- **Done when:** one merge reaches prod with the same digest as staging (shown in the PR).

### 20.3 Rollback
- **Build:** `deploy-aws.yml` runnable by hand with an environment and a digest; `docs/runbooks/rollback.md`
  (including why some migrations can't be rolled back).
- **Terms:** rollback, irreversible migration.
- **Done when:** prod rolled back to the previous digest and forward again.

### 20.4 Autoscaling + WAF
- **Build:** API scales on CPU / requests; worker scales on queue depth (custom metric); AWS WAF on CloudFront
  with managed rules and a rate rule.
- **Terms:** target tracking, cooldown, custom metric.
- **Done when:** a k6 burst scales the API out and back in.

### 20.5 Cost review + teardown
- **Build:** read the bill together in Cost Explorer; destroy prod; destroy staging when pausing (keep
  bootstrap, OIDC, ECR).
- **Terms:** Cost Explorer, cost allocation tags.
- **Done when:** only the cheap foundation remains.
