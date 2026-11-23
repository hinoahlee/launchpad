import type { Config } from "./schema.ts";

// The worker (LISTEN) and migrate need a session of their own, which a transaction-mode pooler can't give.
export const directDatabaseUrl = (config: Config) =>
	config.DATABASE_DIRECT_URL ?? config.DATABASE_URL;

// The public origin. In dev, Vite's server, which proxies /api to the API.
export const appUrl = (config: Config) =>
	config.APP_URL ?? "http://localhost:5173";
