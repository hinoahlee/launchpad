# Restore the database

Two ways to get Render's Postgres data back. Practised on 2026-11-18 (step 5.6); both restores matched.

| | A. `pg_dump` (logical) | B. Point-in-time recovery (physical) |
|---|---|---|
| Use it when | you need the data outside Render: another provider, a local copy, a long-term archive | a mistake on Render: bad `delete`, broken migration |
| Restores to | the moment the dump ran | any moment in the last 3 days (Hobby workspace), but not the last 10 minutes |
| Lands in | any Postgres 17 | a **new** Render database; the original is untouched |

Never restore over the only copy: restore into a new database, check it, then switch.

## Before either: the Shell helper and a fingerprint
Render → **launchpad** → **Shell** (open a new tab after every deploy; an old one stays on the old instance):
```sh
q() { node -e 'const s=require("postgres")(process.env.DB_URL||process.env.DATABASE_URL,{onnotice:()=>{}});s.unsafe(process.argv[1]).then(r=>{console.table(r);return s.end()},e=>{console.error(e.message);process.exit(1)})' "$1"; }
q "select count(*)::int as users, md5(coalesce(string_agg(id || email || name, ',' order by id), '')) as fingerprint, now() as checked_at from users"
```
The fingerprint hashes every row, so a copy proves identical only if it matches the one taken *just before its
backup point*. With more tables, add one count/fingerprint per table. `DB_URL=<internal URL>` points `q` at
another database; `unset DB_URL` afterwards.

## A. Dump, then restore anywhere
1. Allow your IP: **launchpad-db** → **Info** → **Networking** → add `<your IP>/32`
   (`Invoke-RestMethod https://api.ipify.org`). Not in `render.yaml`: the repo is public.
2. Copy **launchpad-db** → **Connect** → **External**, then in PowerShell at the repo root (`.drill/` is git-ignored):
   ```powershell
   $env:RENDER_DB_URL = Get-Clipboard
   docker run --rm -v "${PWD}\.drill:/drill" postgres:17.12-trixie pg_dump -Fc --no-owner --no-acl -f /drill/render.dump -d $env:RENDER_DB_URL
   Remove-Item Env:RENDER_DB_URL; Set-Clipboard -Value ' '
   ```
3. Restore into a new database (here: the local compose Postgres) and fingerprint it:
   ```bash
   docker compose -f compose.dev.yml exec -T postgres psql -U launchpad -c "create database launchpad_restore"
   docker compose -f compose.dev.yml exec -T postgres pg_restore -U launchpad -d launchpad_restore --no-owner --no-acl --exit-on-error < .drill/render.dump
   docker compose -f compose.dev.yml exec -T postgres psql -U launchpad -d launchpad_restore -c "select count(*) ..."   # same query as above
   ```
4. Remove your IP from **Networking**. Delete `.drill/` and `launchpad_restore` when done: the dump is real data.

## B. Point-in-time recovery
1. Pick the time: just before the mistake, at least 10 minutes ago (Render's rule: recent changes aren't in its
   backup storage yet). Times in `now()` output are UTC.
2. **launchpad-db** → **Recovery** → **Point-in-Time Recovery** → **Restore Database** → a name, the time,
   **Copy Existing Settings: Yes** → **Start Recovery**. Wait for **Available**.
3. Check it from the Shell with `DB_URL` = the new database's **Connect** → **Internal** URL.
4. Keep it: point `DATABASE_URL` at it (`render.yaml` `fromDatabase.name`, PR), deploy, check `/api/ready`.
   Drill: **Settings** → **Delete Database** (it's billed while it exists).

## Measured (2026-11-18, 3 rows, ~6 KB dump)
Dump 11.6 s · local restore 1.7 s · PITR: not timed; time it at the next drill.
At this size, RTO is the human steps (access, URLs, checks), not the data. RPO: A = since the last dump; B = minutes.

## Pitfalls hit in the drill
- `Read-Host '<url>'` shows its argument as the *prompt*: the URL was printed and saved to PowerShell history.
  Use `Get-Clipboard`. If a URL leaks, rotate the credential before anything else.
- Windows PowerShell 5.1 strips `"` inside arguments to native programs, so `sh -c '... "$VAR" ...'` splits the
  value. Pass values as plain arguments.
- PITR also restores logins as they were then: restoring to before a credential rotation brings the old password back.
