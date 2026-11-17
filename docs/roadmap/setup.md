# Setup (you)

Only what Phase 0 needs. Later accounts and tools are steps inside the phases, marked 🧑.

## 1. Install tools (~20 min)

| Tool | Check it works |
|---|---|
| Git | `git --version` |
| GitHub CLI, then `gh auth login` | `gh auth status` |
| fnm, then `fnm install 24`, then the shell setup below | `node -v` → v24.x |
| pnpm: `npm install -g pnpm` (not Corepack: its Windows launcher hangs `turbo` on Ctrl+C) | `pnpm -v` |
| Docker Desktop (WSL2 backend) | `docker version` |

**fnm shell setup** (puts `node` on PATH in new terminals):
- Git Bash: add `eval "$(fnm env --use-on-cd --shell bash)"` to `~/.bashrc`.
- PowerShell: `New-Item -Force $PROFILE; Add-Content $PROFILE 'fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression'`
- Apps started outside a terminal (Claude Code hooks): add `%APPDATA%\fnm\aliases\default` to your user `Path`
  (Start → "Edit environment variables for your account"), then restart the app.

## 2. Pick a name
A short template name, e.g. `launchpad`. It becomes the folder, the repo and the AWS resource prefix.

## 3. Defaults already chosen
Change any of these now by editing this table; otherwise they stand.

| Choice | Default |
|---|---|
| Git flow | One short-lived branch + PR per step, squash merge, CI required |
| DNS + registrar | Cloudflare |
| Deploy targets | Render (paid) first, VPS next, AWS optional ([decision 004](../decisions/004-deploy-targets.md)) |
| Domains | `render.<domain>`, `vps.<domain>`, `aws-staging.<domain>` + `aws.<domain>` (AWS) |
| AWS region | `us-east-1` |
| AWS accounts | Organization with `staging` and `prod` member accounts |
| Auth | Better Auth (one session model for web and mobile) |
| Email | Resend |
| Files | S3-compatible: Cloudflare R2 (Render, VPS), S3 on AWS |
| Model | Opus 5.5 for every phase |

## 4. Create the folder (PowerShell)
```powershell
mkdir C:\Users\Noah\Documents\Coding\<name>\docs
Copy-Item -Recurse C:\Users\Noah\Documents\Coding\turborepo\.claude\plans\template-v2 C:\Users\Noah\Documents\Coding\<name>\docs\roadmap
```

## 5. Start Phase 0
In the Claude desktop app:
1. New session → folder `C:\Users\Noah\Documents\Coding\<name>`.
2. Add `turborepo` and `mixmallow` as extra folders (references).
3. Model: Opus 5.5. Output style: Explanatory.
4. Send:
   ```
   Start phase 0. Read docs/roadmap/rules.md first. The template is called <name>.
   ```
