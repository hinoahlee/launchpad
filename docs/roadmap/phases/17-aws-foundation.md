# Phase 17 — AWS foundation (optional)

> **Optional.** AWS comes after every feature works on DigitalOcean
> ([decision 004](../../decisions/004-deploy-targets.md)).
> New AWS accounts may get free credits; check the current offer in step 17.1.

**Goal:** a secure AWS organization, Terraform state, and CI pushing images to AWS with no stored keys.
**You'll need:** AWS account, AWS CLI v2, Terraform, Session Manager plugin. **Cost:** ~$1/mo idle.

### 17.1 🧑 Account + root lockdown
- **You:** sign up; MFA on the root user; budget alerts at $20 and $50; then stop using root. Click paths given.
- **Terms:** root user, MFA, AWS Budgets.
- **Done when:** budget alerts show "OK".

### 17.2 🧑 Organization + sign-in
- **You:** enable AWS Organizations; create `staging` and `prod` member accounts; IAM Identity Center with your
  user and an admin permission set on both; `aws configure sso` profiles `<name>-staging`, `<name>-prod`.
- **Why:** separate accounts are the strongest wall between environments; no long-lived access keys exist.
- **Terms:** management account, member account, single sign-on (SSO), permission set, blast radius.
- **Done when:** `aws sts get-caller-identity --profile <name>-staging` works.

### 17.3 Terraform bootstrap
- **Build:** `infra/aws/bootstrap`: a state bucket per account (versioned, encrypted, public access blocked)
  with S3-native locking. Terraform itself: decision 005 (phase 5).
- **Why:** state is Terraform's memory of what exists; it must be shared, locked and recoverable.
- **Terms:** Terraform, provider, resource, state, backend, lock, plan vs. apply.
- 🧑 **You:** run `terraform apply`.
- **Done when:** `terraform plan` shows no changes.

### 17.4 Layout + infra checks
- **Build:** `infra/aws/modules/`, `infra/aws/envs/{staging,prod}`; the phase 5 infra CI job covers `infra/aws`.
- **Why:** environments become thin files that call shared modules with different sizes.
- **Terms:** root module, environment folder.
- **Done when:** the infra CI job is green.

### 17.5 GitHub OIDC + ECR
- **Build:** `modules/github-oidc` (role only this repo's `main` branch can assume, least-privilege policy),
  `modules/ecr` (scan on push, keep last 30 images). Applied to staging.
- **Why:** GitHub proves who it is with a short-lived token instead of storing AWS keys.
- **Terms:** IAM role, trust policy, OpenID Connect (OIDC), least privilege, container registry.
- 🧑 **You:** apply; create GitHub Environment `staging`.
- **Done when:** the role ARN is an output.

### 17.6 Publish the image on `main`
- **Build:** the `publish` job also pushes `:<sha>` to staging ECR (only when `vars.AWS_ROLE_ARN` is set).
- **Why:** one image, built once, identified by its digest, is what every AWS environment runs.
- **Terms:** image tag vs. digest, immutable tags, artifact.
- **Done when:** `aws ecr describe-images` lists the SHA, and GitHub holds no AWS secrets.
