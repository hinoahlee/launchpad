# Conventions

How code is written here. The layout and features are in [architecture.md](architecture.md).

## Rules
1. **Contract first.** Every request/response body the web app and the API exchange is a Zod schema in
   `packages/shared`, imported by both. No local copies. Zod at every other boundary too: env, webhooks, external APIs.
2. **Tenant isolation.** Every query in a protected route filters on the session's user id or the membership's
   organization id. Another user's or organization's row is a 404, never a 403. Test both sides.
3. **Migrations are generated and reviewed**, and must work with the previous release still running
   (expand/contract: only add, or remove what no running release reads; README "Deploy").
4. **Never weaken or delete a test to make it pass.**
5. **Secrets stay out of the repo and logs.** New env vars: `apps/api/src/config/schema.ts` (Zod) and
   `apps/api/.env.example` (documented there), in the same PR.
6. **Comments only for what the code can't say**: a non-obvious reason, a trap, or a deliberate choice that looks
   like a bug. No history, no restating the code.
7. **Keep files small and in their place** (below): split by responsibility.
8. **UI components come from the shadcn CLI**, never by hand: `pnpm --filter @launchpad/web exec shadcn add <name>`.
   The CSP allows no inline scripts or styles.
9. Discuss before adding a dependency, a service or a new pattern. Pin exact versions in `pnpm-workspace.yaml`'s
   `catalog:` (packages use `"catalog:"`); pick releases at least two weeks old.

Checks enforce the rest; their failure messages say how to fix (if a check is wrong, change it in its own PR): Biome,
`scripts/check-*.ts` (file sizes, import boundaries, edited applied migrations), `tsc`, `db:check`, e2e.

## Where code goes
A file's path should tell you what's in it. Names are kebab-case; these names always mean the same thing:

| Name | Holds | Only |
|---|---|---|
| `routes.ts` | a Fastify plugin: schemas, guards, status codes | HTTP; logic goes to `service.ts` |
| `service.ts` | database and business logic for the folder | no Fastify types |
| `schemas.ts` | Zod schemas and the types inferred from them | |
| `types.ts` | types | no runtime code |
| `constants.ts` | fixed values (numbers, strings, sets, lookup tables) | no functions |
| `utils.ts` | small pure helpers | no I/O |
| `errors.ts` | error classes | |
| `driver/` | one external service behind an interface: `types.ts` (the interface), `create.ts` (picks the implementation from config; `undefined` when unconfigured, which switches the feature off), `<impl>/driver.ts` (`stripe/`, `s3/`, `resend/`, and `memory/` for tests) | |
| `components/` (web) | one React component per file (`sessions-card.tsx`) | |

- **Placement**: a type or constant imported by another file goes in its folder's `types.ts` / `constants.ts`; one
  used by a single file stays in that file. Types inferred from a value (`z.infer`, `$inferSelect`, `ReturnType`)
  stay beside it. Anything else gets a descriptive name for the one thing it does (`verify-event.ts`, `keys.ts`).
- **Imports**: relative inside a module, `#` alias across modules; only `app.ts` and web `routes/` import features
  (`scripts/check-imports.ts` defines modules and says how to fix a violation).
- **Tests** sit next to the file: `foo.ts` → `foo.test.ts`; a feature's HTTP tests may be split by topic
  (`features/auth/bearer.test.ts`). Most are integration tests through `app.inject()` against a real database; unit
  tests for pure logic; e2e only for journeys only a browser proves.
- Errors: `reply.code(4xx); return { error: "snake_case_code" }`, with that status in the route's `response` schema.

## Recipe: add a feature
Work in this order; each step compiles and tests on its own. Read the closest existing feature first
(`features/account` for user-scoped, `features/files` for org-scoped).
1. **Plan**: write down the endpoints, tables and pages, and which user or organization owns each row.
2. **Contract**: `packages/shared/src/schemas/<feature>.ts` (request/response/params schemas + inferred types),
   exported from `index.ts`. Org-scoped params extend `organizationParamsSchema`.
3. **Data** (if needed): a table in `packages/db/src/schema/<domain>.ts` (export it from `schema/index.ts`), with
   `organization_id`/`user_id` referencing their table `ON DELETE CASCADE`. `pnpm db:generate`, read the SQL.
4. **API**: `apps/api/src/features/<feature>/routes.ts` + `service.ts`. User-scoped: `app.addHook("onRequest",
   requireSession)` and `sessionOf(request).user.id`. Org-scoped: also `preHandler: requireMembership("member" |
   "admin" | "owner")` and `membershipOf(request).organizationId`. Register it in `app.ts`.
5. **API tests** (`routes.test.ts`): 401 without a session, a validation failure, the happy path, another user's or
   organization's data (both their URL and their ids in yours), and role limits. Copy the setup from a sibling test.
6. **Web**: `apps/web/src/features/<feature>/api.ts` calling `api(path, schema, init)` (`#lib/api/client.ts`),
   components in `components/` built from `#components/ui`, a page in `routes/` (protected pages copy `beforeLoad`
   from `routes/account.tsx`).
7. **E2E** only for a critical journey: `e2e/tests/<feature>.spec.ts`, importing from `#support/fixtures.ts`.
8. `pnpm verify` and `pnpm e2e`, then a PR (below).

Smaller recipes:
- **Background work**: payload schema in `lib/jobs/schemas.ts` → handler in `handlers.ts` (the compiler requires it)
  → `enqueue(tx, ...)`. Recurring: an entry in `schedules.ts`.
- **An email**: a member in `lib/email/schemas.ts`, a template in `templates/`, a case in `render.tsx`. Never import a
  template from server code: `pnpm dev` runs the server on plain Node, which can't load `.tsx` (the worker uses tsx).
- **An external service**: a `driver/` folder as in the table above; tests pass the memory driver to `buildApp`.
- **An env var**: rule 5. Optional integrations are "all set or all unset", checked in `config/load.ts`.
- **A plan limit**: `ENTITLEMENTS` in `packages/shared/src/constants.ts`, enforced with `entitlementsOf`.

## Git and PRs
- `main` is protected: branch `<type>/<short-slug>` (`feat/notes`), squash-merged PR, required checks green.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`). One concern per PR.
- PR description: `.github/pull_request_template.md`.

## Gotchas
- Shell variables don't reach the apps (Turborepo filters them): set them in `apps/api/.env`.
- Tests share one database (`launchpad_test`, emptied before each test), so test files run one at a time. A test
  making many requests from one IP passes `rateLimitMax` to `buildApp`. Drivers are injected:
  `buildApp(config, { storage, billing })` with the memory drivers.
- An e2e test that provokes a console error on purpose declares it: `test.use({ expectedErrors: [/.../] })`.
- Dev runs the API's `.ts` with plain Node (type stripping): `tsc` rejects enums and other syntax needing a compile
  step, and imports keep their `.ts` extension.
- Better Auth's endpoints answer `{ code, message }`, not our `{ error }`; `lib/api/client.ts` handles both.
- Rate limits are per process (in memory). Running several API instances needs a shared store (`http/rate-limit.ts`).
