# Phase 1 — Container

**Goal:** one Docker image that serves the SPA and the API, plus a written deploy contract.
**You'll need:** Docker Desktop running. **Cost:** $0.

### 1.1 Serve the SPA from the API
- **Build:** `@fastify/static` serves `apps/web/dist`. Browser navigations outside `/api` get `index.html`;
  other misses get JSON 404. Hashed `/assets/*` → `Cache-Control: public, max-age=31536000, immutable`;
  `index.html` → `no-cache`.
- **Why:** one origin means no CORS and simple cookies; correct cache headers make repeat visits instant
  without serving stale code.
- **Terms:** same-origin policy, CORS, SPA fallback, `Cache-Control`, content hashing.
- **Ref:** turborepo `app.ts` (static + not-found handler).
- **Done when:** with a built web app, `/`, `/any/route` (HTML) and `/api/nope` (JSON 404) behave as above.

### 1.2 Production bundle + entrypoints
- **Build:** tsdown bundles `server.ts`, `worker.ts` (stub: logs "idle", exits on `SIGTERM`) and `migrate.ts`
  (stub: validates config, exits 0).
- **Why:** three commands from one artifact; the bundle avoids running raw `.ts` from `node_modules`.
- **Terms:** bundler, entrypoint, external dependency.
- **Ref:** turborepo `apps/api/tsdown.config.ts`.
- **Done when:** `node apps/api/dist/server.js` serves the app.

### 1.3 Dockerfile
- **Build:** multi-stage `Dockerfile` (dependency layer cached by lockfile, build, slim runtime), non-root
  user, `HEALTHCHECK` on `/api/health`, `.dockerignore`.
- **Why:** small, cache-friendly, least-privilege images build fast and limit damage if compromised.
- **Terms:** image, container, layer, multi-stage build, build context, PID 1.
- **Ref:** turborepo `Dockerfile`.
- **Done when:** `docker run -p 3000:3000` serves both; `docker stop` exits in < 5 s; `whoami` is non-root;
  image size reported in the PR.

### 1.4 Deploy contract
- **Build:** `docs/deploy-contract.md` (from `rules.md`), decision `002-single-image.md`.
- **Why:** every platform (Render, AWS, VPS) depends only on this list, which keeps the app portable.
- **Terms:** twelve-factor app, configuration via environment, stateless process.
- **Done when:** the doc exists and matches the code.
