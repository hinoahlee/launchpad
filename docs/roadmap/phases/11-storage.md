# Phase 11 — File storage

**Goal:** users upload and download files directly to and from a bucket; the API only signs URLs.
**You'll need:** your Spaces subscription. **Cost:** included (250 GiB shared across buckets).

### 11.1 Buckets
- **Build:** a Spaces bucket in Terraform with a key scoped to that bucket only (verify per-bucket keys);
  `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` and keys in config (endpoint optional, so S3 needs no change); CORS
  for each origin; private.
- **Terms:** object storage, bucket, object key, CORS, S3-compatible API, scoped access key.
- **Done when:** buckets exist with the right CORS.

### 11.2 Upload + download flow
- **Build:** `StorageDriver` (S3 API, plus in-memory for tests): register → presigned PUT → `complete` (HEAD
  checks size) → presigned GET with `Content-Disposition: attachment`.
- **Terms:** presigned URL, signature, content type, `Content-Disposition`.
- **Ref:** turborepo `apps/api/src/storage/`, `test/helpers/files.ts`.
- **Done when:** tests pass, including another user's file returning 404.

### 11.3 Files example
- **Build:** a files section on the account page; E2E test that intercepts bucket requests.
- **Ref:** turborepo `e2e/tests/files.spec.ts`.
- **Done when:** you upload a real file on the deployed app.

### 11.4 Cleanup
- **Build:** lifecycle rule for abandoned uploads; account deletion removes the user's objects.
- **Terms:** lifecycle policy, orphaned object.
- **Done when:** tests cover deletion.
