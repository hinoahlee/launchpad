# Rulesets

`main.json` is the exact body sent to GitHub's rulesets API (JSON allows no comments, so notes live here).
Apply after editing: `gh api -X PUT repos/noah-lee/launchpad/rulesets/27335323 --input .github/rulesets/main.json`

## `"integration_id": 15368`
The ID of the **GitHub Actions** app. With it, only a `verify` result reported by GitHub Actions counts;
the same name posted by a token, another app or a script is ignored.
- Look it up: `gh api apps/github-actions --jq .id` → `15368` (https://github.com/apps/github-actions)
- Or see who reported a real run: `gh api repos/noah-lee/launchpad/commits/main/check-runs --jq '.check_runs[].app.id'`
- Limit: any workflow in this repo also reports as GitHub Actions, so changes to `.github/workflows/` need
  careful review.
