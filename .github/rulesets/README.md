# Rulesets

`main.json` is the exact body sent to GitHub's rulesets API (JSON allows no comments, so notes live here).
Create it once on a new repo: `gh api -X POST repos/<owner>/<repo>/rulesets --input .github/rulesets/main.json`
Apply after editing: `gh api -X PUT repos/<owner>/<repo>/rulesets/<ruleset-id> --input .github/rulesets/main.json`
(the id: `gh api repos/<owner>/<repo>/rulesets --jq ".[].id"`)

## `"integration_id": 15368`
The ID of the **GitHub Actions** app. With it, only a `verify` (or `e2e`, `image`) result reported by GitHub Actions counts;
the same name posted by a token, another app or a script is ignored.
- Look it up: `gh api apps/github-actions --jq .id` → `15368` (https://github.com/apps/github-actions)
- Or see who reported a real run: `gh api repos/<owner>/<repo>/commits/main/check-runs --jq '.check_runs[].app.id'`
- Limit: any workflow in this repo also reports as GitHub Actions, so changes to `.github/workflows/` need
  careful review.

## `code_scanning`
Blocks merging while CodeQL reports a new high or critical security alert, or an error-level alert, on the PR.
CodeQL runs as GitHub's **default setup** (Settings → Advanced Security), not a workflow file. It needs CodeQL
results for both the PR and `main`: turn default setup on and let it finish on `main` before applying this, or
every PR waits forever.
