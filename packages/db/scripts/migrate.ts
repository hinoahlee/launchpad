// `pnpm db:migrate` in dev: applies packages/db/migrations to DATABASE_URL (from apps/api/.env). Deploys run
// the same runMigrations through `node dist/migrate.js` (apps/api/src/migrate.ts).
import path from "node:path";
import { runMigrations } from "@launchpad/db";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("DATABASE_URL is not set (add it to apps/api/.env)");
	process.exit(1);
}

await runMigrations(
	databaseUrl,
	path.resolve(import.meta.dirname, "../migrations"),
);
console.log("migrations applied");
