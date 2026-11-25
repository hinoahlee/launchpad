# Review rules

Each rule is checkable against the diff. A broken rule is a blocker.

1. **Every new or changed protected route is guarded.** It registers `requireSession` (and, for
   `/api/organizations/:organizationId/...`, `requireMembership(role)` with the lowest role that may act).
2. **Every query is scoped to the caller.** Queries in protected routes filter on `sessionOf(request).user.id` or
   `membershipOf(request).organizationId`, and another user's or organization's row answers 404, not 403.
3. **Tests cover the denied cases.** A new or changed route has tests for 401 without a session, a validation
   failure, another user's or organization's ids (in their URL and in yours), and role limits.
4. **The API contract lives in `packages/shared`.** Request, response and params bodies are Zod schemas exported
   from `packages/shared/src/schemas/`, used by the route and by the web app's `api(path, schema)` call. No local
   copies of a contract type.
5. **Web data goes through `features/<name>/api.ts`.** Components use TanStack Query with the `queryOptions` or
   mutation functions exported there; no `fetch` and no direct API URLs in components.
6. **Migrations are generated and safe while the previous release runs.** A schema change comes with the
   `pnpm db:generate` output; no applied migration is edited; nothing is dropped or renamed that the running
   release still reads; tables referencing `users` or `organizations` use `ON DELETE CASCADE`.
7. **No unexplained new dependency.** Each new package is pinned in `pnpm-workspace.yaml`'s `catalog:`, used as
   `"catalog:"`, and the PR says why it is needed.
8. **Errors and logs leak nothing.** Errors are `{ error: "snake_case" }` with the status declared in the route's
   response schema; no secrets, tokens or other tenants' data in responses or logs.
