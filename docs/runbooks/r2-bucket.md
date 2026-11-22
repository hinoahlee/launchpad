# R2 bucket

Files live in Cloudflare R2: one private bucket per environment, each with its own access key. The API only signs
URLs; browsers upload and download straight to and from the bucket (phase 11).

| Bucket | Used by | CORS origin |
|---|---|---|
| `launchpad-prod` | Render (`launchpad` service) | `https://render.noahlee.xyz` |
| `launchpad-dev` | your `apps/api/.env` | `http://localhost:5173` |

Tests and E2E need no bucket (in-memory driver; E2E intercepts bucket requests).
Free tier (Standard storage): 10 GB-month, 1M writes (Class A) and 10M reads (Class B) a month, no egress fees.
Deletes are free. Check https://developers.cloudflare.com/r2/pricing/ before relying on it.

## Create (once per bucket)
1. Cloudflare dashboard → **R2 object storage**. First time only: R2 must be purchased (a $0 plan; Cloudflare
   asks for a payment method and bills only past the free tier).
2. **Create bucket**: the name from the table, **Location**: Automatic, with a location hint of **Western North
   America** if offered (near Render's Oregon; no jurisdiction), **Default storage class**: Standard. Buckets are private by default: leave public
   access (r2.dev subdomain, custom domain) off.
3. The bucket → **Settings** → **CORS Policy** → **Add CORS policy** → **JSON** tab, paste its policy, **Save**.
   `launchpad-prod`:
   ```json
   [{ "AllowedOrigins": ["https://render.noahlee.xyz"], "AllowedMethods": ["PUT", "GET"],
      "AllowedHeaders": ["Content-Type"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3600 }]
   ```
   `launchpad-dev` (the page you open in dev is Vite's, so that's the origin the browser sends):
   ```json
   [{ "AllowedOrigins": ["http://localhost:5173"], "AllowedMethods": ["PUT", "GET"],
      "AllowedHeaders": ["Content-Type"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3600 }]
   ```
   Without it the browser blocks the upload. Changes can take up to 30 s to apply.
4. **R2 object storage** → **Overview** → **API Tokens: Manage** → **Create Account API token** (an account token
   outlives any one user). Name it after the bucket, **Permissions**: **Object Read & Write**, **Specify bucket(s)**:
   only this bucket, no expiry (rotate by hand, below). **Create**.
5. The next page shows the **Access Key ID**, **Secret Access Key** and the S3 endpoint
   (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`). The secret is shown once: put it in place now.
   - Prod: Render → **launchpad** → **Environment**: `S3_ENDPOINT`, `S3_BUCKET` = `launchpad-prod`,
     `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` → **Save only**. The same four on **launchpad-worker** (it deletes
     files). Then GitHub → Actions → **Deploy to Render** → **Run workflow**. All four together: a bucket without
     keys stops the boot.
   - Dev: the same four in `apps/api/.env`, with `launchpad-dev` and its own token.

## Cleanup (what deletes objects)
| What | When | How |
|---|---|---|
| A file the user deletes | at once | `DELETE /api/files/:id` deletes the row, then the object |
| A deleted account's files | ~20 min after (past any upload URL) | job `delete-user-files`: every object under `users/<id>/` |
| Abandoned uploads (registered, never completed) | hourly, once a day old | job `prune-uploads`: object, then row (frees quota) |
| Unfinished multipart uploads | 7 days | R2's default lifecycle rule (bucket → **Settings** → **Object lifecycle rules**). Keep it; we don't use multipart yet. |

No lifecycle rule for the rest: rules match only a key prefix and an age, and pending and finished files share
`users/<id>/`. A failed object delete is logged as `storage delete failed; object orphaned`; a failed job shows
in the `jobs` table (`status = 'failed'`, `last_error`).

## Rotate a key (leak, or yearly)
1. Create a new token for the same bucket (step 4), set it where the old one was (step 5: web and worker), deploy.
2. Check an upload works, then delete the old token (**API Tokens** → the token → **Delete**).

## If uploads fail
- Browser console says Content Security Policy (`connect-src`): the page and the API disagree on the bucket's
  origin. The CSP allows the origin of `S3_ENDPOINT` (URLs are path-style: `<endpoint>/<bucket>/<key>`).
- Browser console says CORS: the page's origin isn't in the bucket's `AllowedOrigins` (exact match, no path, no
  trailing slash), or a header the browser sends isn't in `AllowedHeaders`.
- 403 `ExpiredRequest`: the signed URL expired (it carries no CORS headers, so it can look like a CORS error).
- 403 `AccessDenied` / `InvalidAccessKeyId`: wrong key, or the token isn't scoped to this bucket.
