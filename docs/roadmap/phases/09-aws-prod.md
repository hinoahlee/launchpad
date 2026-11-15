# Phase 9 — AWS production

**Goal:** prod runs the exact image staging verified, after your approval, with a one-click rollback.
**Cost:** roughly doubles AWS while prod is up. You'll tear it down at the end.

### 9.1 Prod environment
- **Build:** `envs/prod` calling the same modules; deletion protection on RDS; `app.<domain>`; bootstrap,
  OIDC role and ECR in the prod account.
- 🧑 **You:** apply; create GitHub Environment `production` with yourself as required reviewer.
- **Terms:** environment parity.
- **Done when:** `https://app.<domain>` serves.

### 9.2 Promotion
- **Build:** after staging deploys, CI waits for your approval, copies the same digest to prod ECR, migrates,
  deploys.
- **Terms:** promotion, build once / deploy many, approval gate.
- **Done when:** one merge reaches prod with the same digest as staging (shown in the PR).

### 9.3 Rollback
- **Build:** `deploy-aws.yml` runnable by hand with an environment and a digest; `docs/runbooks/rollback.md`
  (including why some migrations can't be rolled back).
- **Terms:** rollback, irreversible migration.
- **Done when:** prod rolled back to the previous digest and forward again.

### 9.4 Cost review + teardown
- **Build:** read the bill together in Cost Explorer; destroy prod; destroy staging when pausing (keep
  bootstrap, OIDC, ECR).
- **Terms:** Cost Explorer, cost allocation tags.
- **Done when:** only the cheap foundation remains.
