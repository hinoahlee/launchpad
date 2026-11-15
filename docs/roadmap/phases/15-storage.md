# Phase 15 — File storage

**Goal:** users upload and download files directly to and from a bucket; the API only signs URLs.
**You'll need:** Cloudflare R2 (for Render/VPS). AWS uses S3. **Cost:** cents.

### 15.1 Buckets
- **Build:** S3 bucket per AWS environment in Terraform (accessed through the task role); an R2 bucket for
  Render with an API token. CORS for each origin; encryption; public access blocked.
- **Terms:** object storage, bucket, object key, CORS, IAM task role vs. access key.
- **Done when:** buckets exist with the right CORS.

### 15.2 Upload + download flow
- **Build:** `StorageDriver` (S3 API, plus in-memory for tests): register → presigned PUT → `complete` (HEAD
  checks size) → presigned GET with `Content-Disposition: attachment`.
- **Terms:** presigned URL, signature, content type, `Content-Disposition`.
- **Ref:** turborepo `apps/api/src/storage/`, `test/helpers/files.ts`.
- **Done when:** tests pass, including another user's file returning 404.

### 15.3 Files example
- **Build:** a files section on the account page; E2E test that intercepts bucket requests.
- **Ref:** turborepo `e2e/tests/files.spec.ts`.
- **Done when:** you upload a real file on staging.

### 15.4 Cleanup
- **Build:** lifecycle rule for abandoned uploads; account deletion removes the user's objects.
- **Terms:** lifecycle policy, orphaned object.
- **Done when:** tests cover deletion.
