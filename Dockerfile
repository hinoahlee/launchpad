# syntax=docker/dockerfile:1
# One image: the API, which also serves the built SPA. Build from the repo root: `docker build -t launchpad .`
# Commands (deploy contract): `node dist/server.js` (default), `node dist/worker.js`, `node dist/migrate.js`.

# Exact tag so a rebuild doesn't silently change Node or Alpine. Bump it on purpose.
FROM node:24.22.3-alpine3.24 AS base
# Corepack installs the pnpm version pinned in package.json's "packageManager".
RUN corepack enable
WORKDIR /repo

FROM base AS build
# Dependencies first: `pnpm fetch` reads only the lockfile, so this layer (the slow download) stays cached
# until dependencies change. Editing source code doesn't invalidate it.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm --filter @launchpad/api --filter @launchpad/web build
# A self-contained copy of the API package: package.json, dist/, and only production node_modules.
RUN pnpm deploy --legacy --filter @launchpad/api --prod /out/api

FROM node:24.22.3-alpine3.24 AS runtime
ENV NODE_ENV=production
# Same layout as apps/ in the repo, so dist/server.js finds the SPA at ../../web/dist.
WORKDIR /app/api
COPY --from=build /out/api ./
COPY --from=build /repo/apps/web/dist /app/web/dist
# Least privilege: the built-in `node` user (uid 1000) can read the app but not change it (files stay
# root-owned), so a compromised process can't rewrite the code it runs.
USER node
EXPOSE 3000
# fetch, not curl: Alpine has no curl, and Node is already here.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Exec form (JSON array): node runs as PID 1 and receives SIGTERM directly, not through a shell.
CMD ["node", "--enable-source-maps", "dist/server.js"]
