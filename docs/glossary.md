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
- **Image** — a read-only snapshot of a filesystem plus a start command; built once, run anywhere. (1.3)
- **Container** — a running process started from an image, with its own filesystem view and network. (1.3)
- **Layer** — the filesystem change one Dockerfile instruction makes; reused from cache while its inputs are
  unchanged, so slow steps go first. (1.3)
- **Multi-stage build** — a heavy build stage with all the tools, then a slim runtime stage that copies in
  only the output. (1.3)
- **Build context** — the files sent to Docker for `COPY`, trimmed by `.dockerignore`. (1.3)
- **PID 1** — the first process in a container; Linux gives it no default signal handling, so it must handle
  `SIGTERM` itself or be killed after the timeout. (1.3)
- **Twelve-factor app** — a widely used checklist for apps that deploy cleanly anywhere (config in env, stateless
  processes, logs to stdout, ...). (1.4)
- **Configuration via environment** — settings come from environment variables, so one image runs in every
  environment with different values. (1.4)
- **Stateless process** — keeps nothing on local disk or in memory that it would miss if replaced, so
  platforms can kill, restart and scale it freely. (1.4)
- **Workflow** — a YAML file in `.github/workflows/` that GitHub Actions runs on events like a PR or a push.
  (2.1)
- **Job** — a group of steps in a workflow that runs on one machine; jobs run in parallel unless one `needs`
  another. (2.1)
- **Step** — one command (`run:`) or reusable action (`uses:`) inside a job, run in order. (2.1)
- **Runner** — the fresh virtual machine a job runs on (`ubuntu-latest`), thrown away afterwards. (2.1)
- **Cache (CI)** — files saved from one run and restored in the next, keyed on a hash (here, of
  `pnpm-lock.yaml`), so installs skip re-downloading. (2.1)
- **`GITHUB_TOKEN`** — a short-lived token GitHub gives each run; `permissions:` limits what it can do. (2.1)
- **SHA pinning** — referencing an action by commit hash instead of a tag, because a tag can be moved to
  different code. (2.1)
- **Status check** — a pass/fail result a CI job reports on a commit; shown as ✓/✗ on the PR. (2.2)
- **Required check** — a status check that must pass before GitHub allows a merge. (2.2)
- **Branch protection** — rules on a branch (here a GitHub *ruleset*) such as "no force-push" and "merge only
  through a PR with green checks". (2.2)
- **Buildx** — Docker's build front end (on BuildKit); can build for other platforms and import/export its
  layer cache, e.g. to the GitHub Actions cache. (2.3)
- **Build cache** — stored layers from earlier builds; Docker reuses a layer while its instruction and inputs
  are unchanged. On a fresh CI runner it must be imported from outside (`cache-from`). (2.3)
- **Cache hit** — a step found its result in the cache and skipped the work (`CACHED` in the build log); a
  **cache miss** redoes it. (2.3)
- **Semantic versioning (semver)** — `major.minor.patch`: a major release may break you, a minor adds
  features, a patch only fixes. A promise by the author, not a guarantee. (2.4)
- **Supply-chain attack** — attacking an app through something it depends on (a hijacked npm package or
  GitHub Action) instead of its own code. (2.4)
- **CVE** — a public ID (`CVE-2026-1234`) for one known vulnerability; Dependabot alerts match these against
  the lockfile. (2.4)
- **Release age (cooldown)** — waiting a few days before adopting a new release, so malicious or broken
  versions are usually caught and pulled first. (2.4)

## Phase 3 — First deploy (Render)
- **PaaS (platform as a service)** — you hand over code or an image; the platform runs the servers, TLS,
  deploys and restarts. Render is one. (3.1)
- **Registrar** — the company you rent a domain name from; it records which nameservers answer for it. (3.1)
- **Nameserver** — the server the internet asks for a domain's DNS records; pointing a domain at Cloudflare's
  nameservers puts Cloudflare in charge of them. (3.1)
- **DNS zone** — the full set of DNS records for one domain, held by its nameservers. (3.1)
- **Infrastructure as Code (IaC)** — servers and services described in files in the repo, reviewed in PRs and
  applied by a tool, instead of clicked together in a dashboard. (3.2)
- **Blueprint** — Render's IaC file (`render.yaml`); Render syncs the services it describes on every push. (3.2)
- **Health check** — a request the platform makes to an instance (here `/api/ready`) to decide whether it may
  receive traffic. (3.2)
- **Zero-downtime deploy** — start the new version next to the old one, switch traffic only once it passes
  its health check, then stop the old one. (3.2)
- **DNS record** — one entry in a zone. An **A** record maps a name to an IPv4 address; a **CNAME** says a name
  is an alias for another name (`render.noahlee.xyz` → `launchpad-mn7r.onrender.com`). (3.3)
- **TTL (time to live)** — how many seconds resolvers may cache a DNS answer before asking again; it bounds
  how long a change takes to reach everyone. (3.3)
- **TLS certificate** — a file binding a domain name to a public key, signed by a CA; the browser checks it
  before trusting the connection (the padlock). (3.3)
- **Certificate authority (CA)** — an organization browsers trust to sign certificates, after it checks the
  requester controls the domain. (3.3)
- **Let's Encrypt** — a free, automated CA; certificates last 90 days and are renewed automatically. Render
  uses it (and Google Trust Services). (3.3)
- **Proxied vs. DNS-only** — in Cloudflare, proxied (orange cloud) sends traffic through Cloudflare, which
  answers with its own IPs and certificate; DNS-only (grey cloud) just hands out the target, and clients
  connect straight to it. (3.3)
- **SNI (Server Name Indication)** — the hostname a browser sends at the start of a TLS connection, so one IP
  can serve many sites, each with its own certificate. (3.3)
- **Rollback** — go back to the previous version by redeploying it. Fast, and right when the old version is
  known good. (3.4)
- **Roll forward** — fix the problem with a new change and deploy that, instead of going back. Normal when the
  fix is small, or when the old version can't run (e.g. after a database migration). (3.4)
- **Revert commit** — a new commit that undoes an earlier one (`git revert <sha>`), so history keeps both the
  mistake and its undo, and the undo ships through the normal PR → CI → deploy path. (3.4)

## Phase 4 — Render delivery
- **Container registry** — a server that stores images by name so any machine can pull them (`docker pull`).
  (4.1)
- **GHCR (GitHub Container Registry)** — GitHub's registry at `ghcr.io`; CI pushes to it with the built-in
  `GITHUB_TOKEN`, no extra secret. (4.1)
- **Image tag vs. digest** — a tag (`:abc123`, `:latest`) is a name that can be moved to another image; a
  digest (`@sha256:…`) is the hash of the image's content, so it always means exactly those bytes. (4.1)
- **Package visibility** — whether a GHCR image is public (anyone can pull) or private (pulling needs a
  token). New packages start private. (4.1)
- **Image-backed service** — a Render service that pulls a prebuilt image from a registry instead of building
  the repo (a Git-backed service). (4.2)
- **Instance type** — the CPU and memory size a service runs on, and what you pay for (here `0.5c-512mb`). (4.2)
- **Spin-down** — a free service stopping after idle time; the next request waits for it to start again (a cold
  start). Paid instances stay on. (4.2)
- **Deploy hook** — a secret URL that starts a deploy of one Render service when called; with `imgURL` it
  deploys a given digest of that service's image, nothing else. (4.3)
- **Continuous deployment** — every change merged to `main` that passes CI goes live with no manual step. (4.3)
- **GitHub Environment** — a named deploy target (here `production`) with its own secrets and rules, such as
  which branches may deploy to it. (4.3)
- **Reusable workflow** — a workflow other workflows call like a function (`on: workflow_call`, `uses:`). (4.3)
- **`workflow_dispatch`** — a trigger that adds a "Run workflow" button (with inputs) in the Actions tab. (4.3)
- **Managed database** — a database the provider runs for you: installs, patches, backups, restores. You pay
  for an instance size plus storage. (4.4)
- **Internal vs. external URL** — the internal URL works only inside the provider's private network (from your
  own services, fast, no internet); the external one is reachable from anywhere it's allowed. (4.4)
- **IP allow list** — the address ranges allowed to connect from the internet; empty means nobody. (4.4)
- **Pre-deploy step** — a command the platform runs once per deploy, in a throwaway container from the new
  image, before the new version starts; if it fails, the deploy stops and the old version keeps serving.
  The slot for migrations. (4.4)

## Phase 5 — Database
- **Environment variable** — a named value the operating system hands a process at start (`PORT=3000`); the
  same image gets different settings on each platform without a rebuild. (5.1)
- **Connection string** — one URL with everything needed to reach a database:
  `postgres://user:password@host:port/database`. It holds the password, so treat it as a secret. (5.1)
- **Container volume** — storage Docker keeps outside a container's own filesystem; a named volume survives
  the container being removed, so the database's data does too (until `down -v`). (5.1)
- **Schema** — the shape of the database: tables, columns, types, constraints. Here it's written in
  TypeScript (`packages/db/src/schema.ts`), so queries are type-checked against it. (5.2)
- **ORM (object-relational mapper)** — a library that maps tables to code and builds SQL for you. Drizzle is a
  thin one: its queries read like SQL and you can always see the SQL it runs. (5.2)
- **DDL (data definition language)** — SQL that changes structure, not data: `CREATE TABLE`, `ALTER TABLE`,
  `CREATE INDEX`. (5.2)
- **Migration** — a numbered SQL file of DDL that moves the schema one step forward. Applied in order, once
  each; the database records which ones ran (`drizzle.__drizzle_migrations`). (5.2)
- **`citext`** — a Postgres extension type: text compared case-insensitively, so `Bob@x.com` = `bob@x.com`
  for uniqueness and lookups, while the original casing is kept for display. (5.2)
- **Connection pool** — a set of open database connections a process keeps and reuses, so a request doesn't
  pay for a new connection (several network round-trips plus authentication) each time. (5.3)
  Each process has its own pool (postgres.js: up to 10), and all of them count against the server's
  `max_connections` (Render: 100 under 8 GB). (8.4)
- **Timeout** — the longest you'll wait for something before treating it as failed, so a stuck dependency
  can't hang your code forever. (5.3)
- **HTTP 503 (Service Unavailable)** — "I'm running but can't serve right now", e.g. the database is down.
  Load balancers stop sending traffic to an instance that answers 503 on its readiness probe. (5.3)
- **Service container** — a container CI starts next to a job (here Postgres in the `verify` job), reachable
  on a port, deleted with the job. Gives tests a real dependency with no shared state between runs. (5.4)
- **Test isolation** — each test runs from a known state and can't see another test's data. Here: tables are
  emptied before every test, and test files sharing the database run one at a time. (5.4)
- **Factory** — a test helper that creates a valid record with sensible defaults (`insertUser(db, { email })`),
  so a test only spells out the fields it's about. (5.4)
- **Backward-compatible migration** — a schema change the release still serving keeps working with: it only
  adds (a table, a nullable or defaulted column) or removes what nothing reads any more. (5.5)
- **Expand/contract** — a breaking change split across releases: expand (add the new shape), move the code and
  data over, then contract (drop the old shape) once no running release uses it. A rename takes 3–4 PRs. (5.5)
- **Logical vs. physical backup** — logical: the data exported as SQL or a dump file (`pg_dump`), restorable on
  any Postgres. Physical: a copy of the database's files plus its change log (WAL), restorable only on the same
  Postgres version, but to any moment. (5.6)
- **Point-in-time recovery (PITR)** — rebuild the database as it was at a chosen moment: the last physical
  snapshot before it, plus the WAL replayed up to that moment. On Render, into a new database. (5.6)
- **RPO / RTO** — recovery point objective: how much recent data you can afford to lose. Recovery time
  objective: how long getting it back may take. A drill measures both. (5.6)

## Phase 6 — Observability

- **Structured logging** — each log line is JSON with named fields (`status`, `route`, `requestId`), not a
  sentence, so a log tool can filter and search by field instead of by text. (6.1)
- **Correlation ID (request ID)** — one ID given to a request and stamped on every log line, error body and
  header it produces, so one search finds everything that happened to it. Here: `x-request-id`. (6.1)
- **Log level** — how serious a line is: `trace` < `debug` < `info` < `warn` < `error` < `fatal`. `LOG_LEVEL`
  sets the lowest one written; quieter lines (successful probes at `debug`) are dropped. (6.1)
- **Redaction** — replacing a secret field's value (`password`, `authorization`) with `[redacted]` before the
  line is written, so a mistake in what you log can't leak it into the log store. (6.1)
- **Error tracking** — a service (Sentry) that receives every unexpected error with its stack trace, groups
  repeats into one issue, and alerts you on new ones. Logs say what happened; error tracking says what broke. (6.2)
- **Release** — the version of the code an error came from. Here the git SHA, so an issue shows which deploy
  introduced it and whether a later one fixed it. (6.2)
- **Source map** — a file mapping bundled, minified code back to the original source lines, so a stack trace
  reads `app.tsx:42` instead of `index-a1b2.js:1:80423`. Ours are uploaded to Sentry, not served. (6.2)
- **Sampling** — sending only a fraction of events to save cost or quota. We send 100% of errors and no
  traces (per-request timing), which would be sampled when added. (6.2)
- **Uptime check** — a request sent to your site on a schedule (here `GET /api/ready` every minute) to ask
  "can users reach it?". Fails on an error status, a timeout or no answer. (6.3)
- **Synthetic monitoring** — checks made by a robot pretending to be a user, so you learn about an outage
  even when no real user is on the site. An uptime check is the simplest kind. (6.3)
- **Alert fatigue** — so many alerts, or so many false ones, that people stop paying attention. Why the
  monitor waits for 3 failures in a row and 4xx errors don't alert. (6.3)
- **SLO (service level objective)** — a reliability target you choose, e.g. "99.9% of checks pass each month"
  (about 43 minutes of downtime allowed). It tells you when reliability needs work, not just that it failed. (6.3)
- **Incident** — something is broken for users right now and needs a response, not just a ticket. (6.4)
- **MTTR (mean time to recovery)** — how long, on average, from noticing a problem to users being OK again.
  Reverting first keeps it short. (6.4)
- **Blameless postmortem** — a short write-up after an incident about what in the system let it happen and
  what change would catch it next time, never about who to blame. (6.4)

## Phase 7 — App foundations
- **API contract** — the agreed shape of every request and response between two programs. Here: Zod schemas
  in `packages/shared`, imported by both the API and the web app. (7.1)
- **Schema validation** — checking incoming data against a schema and rejecting what doesn't fit, before any
  code uses it (bad input → 400 `validation_failed`). (7.1)
- **Type provider** — a Fastify plugin that turns a route's schemas into TypeScript types for its handler, so
  `request.query` and the return value are checked by the compiler. (7.1)
- **Serialization** — turning a value into bytes to send (JSON). The response schema runs first and drops any
  field it doesn't list, so a stray `passwordHash` never leaves the server. (7.1)
- **XSS (cross-site scripting)** — an attacker gets their script to run on your page (e.g. through a comment
  rendered as HTML), where it can act as the signed-in user. (7.2)
- **Content Security Policy (CSP)** — a response header listing where a page may load scripts, styles and
  connections from. `script-src 'self'` means only our own files run, so injected script is blocked. (7.2)
- **HSTS** — `Strict-Transport-Security`: tells the browser to use only HTTPS for this site for a set time, so
  a network attacker can't downgrade a visit to plain HTTP. (7.2)
- **Rate limiting** — capping how many requests one client may make per time window (here 100 per minute per
  IP on `/api`), so one script can't guess passwords or overload the app. (7.2)
- **Reverse proxy headers** — `X-Forwarded-For` (and `-Proto`, `-Host`): what each proxy in front of the app
  adds so the app can see the real client. Clients can send them too, so trust only the hops you run. (7.2)
- **Client-side routing** — the browser app maps URLs to pages itself: a link click changes the URL and swaps
  the page without asking the server for new HTML. The server only sends `index.html` once. (7.3)
- **Server state vs. client state** — server state is data the API owns (users, files); the browser keeps only a
  cached copy that can go stale (TanStack Query). Client state belongs to this browser alone (theme, an open
  menu). (7.3)
- **Cache invalidation** — marking cached server data as out of date so it is fetched again, e.g. after a change
  you made or on a "refresh" click (`queryClient.invalidateQueries`). (7.3)
- **Design tokens** — named design values (`--background`, `--primary`, `--radius`) that components use instead
  of raw colors, so dark mode or a rebrand changes one file (`index.css`). (7.3)
- **Responsive design** — one layout that adapts to the screen's width instead of separate mobile and desktop
  sites. "Mobile first": write the phone styles first, then add changes for wider screens. (7.4)
- **Breakpoint** — the width where the layout changes, e.g. Tailwind's `sm:` (640px) or `lg:` (1024px).
  `sm:grid-cols-2` means "two columns from 640px up". (7.4)
- **Touch target** — the area that responds to a tap. A fingertip needs about 44px; on touch screens
  (`pointer: coarse`) our buttons and links grow to that, a mouse keeps the compact sizes. (7.4)
- **Safe area** — the part of a phone screen not covered by the notch, rounded corners or home bar;
  `env(safe-area-inset-*)` pads content into it. (7.4)
- **End-to-end (E2E) test** — a test that drives the real app in a real browser, like a user: open a page, click,
  check what's on screen. Slow but proves the pieces work together (Playwright, `e2e/`). (7.5)
- **Flaky test** — a test that sometimes passes and sometimes fails on the same code, usually from timing.
  CI retries failures twice and reports a pass-on-retry as "flaky": a bug to fix, not noise. (7.5)
- **Test pyramid** — many fast unit/integration tests at the bottom, few slow E2E tests on top. Test each thing
  at the lowest level that can catch its bug. (7.5)
- **Queue** — a waiting line of work. Here it's the `jobs` table: rows wait as `queued` until a worker takes
  them, so slow or retryable work happens outside the web request. (8.1)
- **Producer / consumer** — the producer adds work to a queue (the API calling `enqueue()`); the consumer takes
  it off and does it (the worker process). Neither waits for the other. (8.1)
- **Transactional outbox** — write the "do this later" message in the same database transaction as the data
  it's about. Both commit or neither does, so no job points at unsaved data and no saved data misses its job.
  (8.1)
- **At-least-once delivery** — every job runs, but some may run twice (a worker crashes after doing the work
  but before marking it done). The alternative, at-most-once, can lose jobs. (8.2)
- **Idempotency** — running something twice has the same effect as running it once. Job handlers must be
  idempotent because of at-least-once delivery, e.g. "skip if already sent". (8.2)
- **Lease** — a claim that expires: a worker owns a job only until `lease_expires_at`. If it crashes, the lease
  runs out and another worker takes the job, so nothing stays stuck. (8.2)
- **Fencing token** — a number that goes up with each claim (`attempts`). A write only counts if it carries
  the current number, so a slow worker whose lease ran out can't overwrite the new owner's result. (8.2)
- **Exponential backoff** — wait longer after each failure (10 s, 20 s, 40 s...), so a struggling service gets
  time to recover instead of a flood of retries. (8.2)
- **`FOR UPDATE SKIP LOCKED`** — Postgres: lock the rows I pick, and skip rows someone else has locked instead
  of waiting. Lets many workers pull from one table without taking the same job. (8.2)
- **`LISTEN` / `NOTIFY`** — Postgres' built-in messages: a worker listens on a channel, `enqueue()` notifies it,
  and the message arrives when the transaction commits. Polling stays as a fallback. (8.2)
- **Cron expression** — five fields, "minute hour day-of-month month day-of-week", describing when something
  repeats: `0 * * * *` = every hour on the hour, `30 3 * * 1` = Mondays 03:30. Ours are read in UTC. (8.3)
- **Scheduler** — the part that turns schedules into jobs at the right times. Ours only queues; the worker runs
  the jobs like any other. Every worker runs one, so there's no single scheduler process to keep alive. (8.3)
- **Singleton job** — a job that must exist at most once, however many processes try to create it. Here: a
  unique `jobs.key` (`prune-jobs:2026-01-01T10:00:00.000Z`), so the second insert does nothing. (8.3)
- **Worker process** — a long-running process that serves no traffic and only does background work. Ours is the
  same image as the web service, started as `node dist/worker.js`; Render calls it a background worker. (8.4)
- **Connection pooler** — a separate program (e.g. PgBouncer) between the app and Postgres: apps connect to it,
  and it shares a few real Postgres connections among them. Pays off with many processes or short-lived ones;
  a single long-running process gains nothing over its own pool. (8.4)
- **Session vs. transaction mode** — how a pooler lends its real connections. Session mode: one per client
  until it disconnects; everything works. Transaction mode: one per transaction, then back to the pool; far
  fewer real connections, but whatever lives on a connection breaks (`LISTEN`, `SET`, prepared statements,
  session advisory locks, temp tables). Render's pooler is transaction mode, port 6432. (8.4)

## Phase 9 — Email
- **Transactional vs. marketing email** — transactional: one person, triggered by their own action (welcome,
  sign-in link, receipt). Marketing: bulk, sent to people who opted in. We only send transactional. (9.1)
- **Adapter pattern** — code depends on one small interface (`EmailDriver`); each provider is an adapter behind
  it, so tests swap in an in-memory one and a new provider changes no callers. (9.1)
- **Idempotency key** — an id sent with a request so the receiver can recognize a repeat and act once. Our
  emails use the job id, so a retried job reuses it and the provider delivers once. (9.1)
- **JSX** — HTML-like tags inside code (`<Heading>Hi</Heading>`), in `.tsx` files. A build step turns them into
  plain function calls; plain Node can't read them. (9.1)
- **SSR vs. SSG** — server-side rendering: HTML made on the server each time, with that moment's data. Static
  site generation: HTML made once at build time, the same for everyone. Emails are SSR without hydration:
  rendered per recipient, sent as final HTML, no JavaScript in the inbox. (9.1)
- **tsx** — a dev tool that runs `.ts`/`.tsx` files by converting them as Node loads them, and restarts on
  change. Runs the worker in dev; production runs the built bundle instead. (9.1)
- **SPF** — a DNS record listing the servers allowed to send for a domain. The receiver checks the sending server
  against it. Ours is on `send.mail.noahlee.xyz`, the bounce address Resend uses. (9.2)
- **DKIM** — a signature the sending server adds to each email, checked against a public key in DNS
  (`resend._domainkey.mail`). Proves the domain sent it and nothing changed on the way. (9.2)
- **DMARC** — a DNS record (`_dmarc`) telling receivers what to do when an email claiming to be from the domain
  fails: `p=none` (only report), `quarantine` (spam folder), `reject`. Passes when SPF or DKIM passes for
  the same domain as the visible From. (9.2)
- **Sender reputation** — how much inbox providers trust a sending domain, built from its history: bounces, spam
  complaints and failed checks lower it, and a low one sends all its email to spam. Why we send from a subdomain. (9.2)
- **Hard vs. soft bounce** — hard (Resend: `Permanent`): the address doesn't exist or refuses us for good; never
  send to it again. Soft (`Temporary`): full mailbox, server down; usually clears up, so we keep sending. (9.3)
- **Spam complaint** — the recipient pressed "Report spam". Inbox providers count these heavily; we stop emailing
  that address. (9.3)
- **Webhook signature** — an HMAC of the request body, keyed with a secret only the sender and we know, sent in a
  header. A match proves the sender sent this exact body; a timestamp in the signed text stops replays. (9.3)

## Phase 10 — Auth
- **Session** — the server's record that a person is signed in on one device: a row in `sessions` with who and
  until when. Deleting the row signs that device out. (10.1)
- **Session token** — the random, unguessable string a client holds to prove which session is theirs. The browser
  keeps it in a cookie; a mobile app will send it in a header. Whoever has it is signed in. (10.1)
- **Cookie attributes** — rules the server attaches to a cookie. `HttpOnly`: page JavaScript can't read it, so an
  injected script can't steal it. `Secure`: sent over HTTPS only. `SameSite=Lax`: not sent on requests other sites
  start in the background (forms, fetch), only on normal link clicks. (10.1)
- **CSRF (cross-site request forgery)** — another site makes your browser send a request to ours, and the browser
  attaches your cookie, so it runs as you. Stopped by `SameSite` and by checking the `Origin` header against
  ours. (10.1)
- **Account linking** — several sign-in methods (Google, an email code) attached to one user. Better Auth links a
  new method to an existing user by email only when the provider vouches the email is theirs. (10.1)
- **OAuth 2.0** — a standard for letting one site (us) get limited access from another (Google) on a person's
  behalf, without ever seeing their Google password. Google asks the person, then hands us a code. (10.2)
- **OpenID Connect (OIDC)** — a layer on OAuth 2.0 for sign-in: besides access, Google tells us *who* the person is
  (an ID token with their id, email, name). (10.2)
- **Authorization code flow** — the OAuth flow for servers: the browser goes to Google, comes back to us with a
  short-lived code, and our server trades the code (plus its client secret) for tokens, server to server. The
  tokens never pass through the browser. (10.2)
- **PKCE** — "pixie": before sending the browser to Google, we make a random secret and send only its hash. When
  trading the code, we send the secret itself. A code stolen on the way back is useless without it. (10.2)
- **Redirect URI** — where Google sends the browser back with the code: `<APP_URL>/api/auth/callback/google`.
  Google only sends codes to URIs listed in the client, exactly, so an attacker can't have them sent elsewhere. (10.2)
- **Scope** — what we ask Google for. Ours: `openid email profile` (who you are, your email, name and picture);
  nothing else, so Google needs no review of the app. (10.2)
- **ID token** — a JWT signed by Google stating who signed in (`sub`, `email`, `email_verified`, `name`). Better
  Auth checks the signature, then finds or creates the user. (10.2)
- **OAuth state** — a random value we send to Google and expect back unchanged, stored on our side (or in a
  cookie) until then. A callback with an unknown state wasn't started by this browser: refused. (10.2)
- **One-time password (OTP)** — a short code that works once and expires soon (ours: 6 digits, 5 minutes), sent
  to something only the person has, here their inbox. We store only its hash. (10.3)
- **Passwordless** — signing in without a password: proving you own an inbox (a code) or a Google account. No
  password to forget, reuse or leak; a first sign-in with a code creates the account. (10.3)
- **Brute-force protection** — stopping someone from guessing codes until one works. Ours: a code dies after 3
  wrong guesses, and each IP may ask for 3 codes and make 3 sign-in tries a minute. (10.3)
- **Authentication vs. authorization** — authentication: *who* are you (a valid session; `requireSession`).
  Authorization: *what* may you touch (a route only reads or changes rows with your user id). Both, every
  request. (10.4)
- **401 vs. 403** — 401 Unauthorized: we don't know who you are, so sign in and retry. 403 Forbidden: we know,
  and the answer is no. For someone else's row we answer 404, as if it didn't exist, so the answer doesn't
  confirm it's there. (10.4)
- **Session revocation** — ending a session before it expires by deleting its row: that device is signed out on
  its next request. The account page does it per device. (10.4)
