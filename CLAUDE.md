# CLAUDE.md

**Follow [docs/roadmap/rules.md](docs/roadmap/rules.md).** It defines how phases and steps run, the PR flow,
safety rules and code conventions. During a phase, read only that phase's file in `docs/roadmap/phases/`.

## Project map
- `docs/roadmap/`: the plan (`README.md` status table, `rules.md`, `phases/`)
- `docs/glossary.md`: every term introduced so far
- `docs/decisions/`: decision notes (`NNN-title.md`, from `000-template.md`)
- `.github/pull_request_template.md`: the PR description format
- References (read-only): `../turborepo`, `../mixmallow`

## Commands
None yet. Workspace scripts arrive in step 0.2.

## Git
- `main` is protected: every change is a branch `p<N>.<step>-<slug>` and a squash-merged PR.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:` ...). The agent never merges PRs.
