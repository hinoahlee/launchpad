# Glossary

Terms in the order they were introduced. Each one: a one-line definition, and the step that introduced it.

## Phase 0 — Workspace
- **Trunk-based development** — everyone merges small changes into one main branch (the trunk) often, instead
  of keeping long-lived branches. (0.1)
- **Pull request (PR)** — a request to merge a branch into another, with a diff and discussion for review. (0.1)
- **Branch ruleset** — server-side rules GitHub enforces on matching branches, e.g. "changes only through a
  PR", "no force-push". (0.1)
- **Squash merge** — merges a PR as one single commit on the target branch, so `main` has one commit per
  change. (0.1)
- **Workspace** — one repo holding several packages that are installed together and can depend on each other
  (`workspace:*`). (0.2)
- **Lockfile** — `pnpm-lock.yaml`: the exact resolved version of every dependency, so every install is
  identical. (0.2)
- **Catalog** — the `catalog:` list in `pnpm-workspace.yaml`; packages write `"catalog:"` instead of a version,
  so there is one version per dependency. (0.2)
- **Task graph** — the order Turborepo runs tasks in, derived from package dependencies (`^build` = build my
  dependencies first); unchanged tasks come from cache. (0.2)
- **Linter vs. formatter** — a linter finds likely bugs and bad patterns; a formatter only rewrites layout
  (spacing, quotes). Biome does both. (0.2)
- **Fail fast** — stop at the first sign of a bad state (e.g. invalid config at boot) instead of limping on and
  failing later in a confusing place. (0.3)
- **App factory** — a function (`buildApp(config)`) that returns a configured app without starting it, so
  tests and the server build it the same way. (0.3)
- **Liveness vs. readiness probe** — liveness (`/api/health`): "the process is alive, don't restart me";
  readiness (`/api/ready`): "I can serve traffic, route requests to me". (0.3)
- **Structured logging** — logs as one JSON object per line with named fields, so tools can filter and
  search them. (0.3)
- **Request ID** — a unique ID per request, put on every log line for that request and returned in the
  `x-request-id` header, so one request can be traced end to end. (0.3)
- **`SIGTERM`** — the signal a platform sends to ask a process to stop (Ctrl+C sends `SIGINT`); after a grace
  period it sends `SIGKILL`, which can't be caught. (0.3)
- **SPA (single-page application)** — the browser loads one HTML page and JavaScript; React renders every
  screen and only data comes from the API. (0.4)
- **Dev server** — Vite's local server: serves source files on the fly while you develop; production uses the
  built files in `dist/`. (0.4)
- **Proxy** — a server that forwards requests elsewhere; Vite forwards `/api/*` to the API on port 3000. (0.4)
- **HMR (hot module replacement)** — on save, the dev server swaps the changed module into the open page
  without a reload, keeping state. (0.4)
- **Origin** — scheme + host + port (`http://localhost:5173`). The browser isolates origins; one origin
  means no CORS setup. (0.4)
- **Test runner** — the tool that finds test files, runs them and reports pass/fail (Vitest). (0.5)
- **Unit vs. integration test** — a unit test checks one function alone; an integration test runs several
  parts together (here: a request through Fastify's real hooks and routes). (0.5)
- **In-process HTTP injection** — `app.inject()` hands a fake request straight to the app's router: no port,
  no network, same code path as a real request. (0.5)
- **Subpath imports** — the `"imports"` field in `package.json`: `#lib/x.ts` maps to `./src/lib/x.ts` for that
  package only. Paths don't change when files move, and code can't reach into another package. (0.6)
- **Colocation** — keeping a test next to the file it tests (`foo.ts` + `foo.test.ts`), so they are read,
  changed and deleted together. (0.7)
- **Testing trophy** — a test mix with most tests at the integration level, some unit tests for pure logic,
  and few E2E tests; fits when integration tests are cheap, as with `app.inject()`. (0.7)
- **Hook** — a command Claude Code runs automatically at a set point (after an edit, before stopping); a
  failing hook sends its output back to the agent to fix. (0.8)
- **Feedback loop** — how quickly a mistake is reported to whoever made it; shorter loops make fixes
  cheaper (on edit < before stopping < CI < review). (0.8)

## Phase 1 — Container
- **Same-origin policy** — a browser lets a page read responses only from its own origin (scheme + host +
  port). (1.1)
- **CORS** — headers a server sends to let pages from other origins read its responses; not needed when the
  SPA and API share one origin. (1.1)
- **SPA fallback** — the server answers browser navigations to unknown non-API paths with `index.html`, so
  the client-side router can handle deep links like `/settings`. (1.1)
- **`Cache-Control`** — response header telling browsers and CDNs whether and how long they may reuse a
  response (`no-cache` = check with the server first; `immutable` = never re-check). (1.1)
- **Content hashing** — the build puts a hash of a file's contents in its name, so a changed file gets a new
  URL and old ones can be cached forever. (1.1)
- **Bundler** — follows `import`s from an entry file and writes a few output files; tsdown also strips
  TypeScript types. (1.2)
- **Entrypoint** — a file a process starts from; the API has three: `server`, `worker`, `migrate`. (1.2)
- **External dependency** — a package the bundle imports from `node_modules` at runtime instead of copying
  it in; all npm packages stay external here. (1.2)
- **Source map** — a `.map` file linking bundled code back to the original source, so stack traces show
  `src/*.ts` lines (`node --enable-source-maps`). (1.2)
