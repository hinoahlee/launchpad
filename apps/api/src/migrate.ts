import path from "node:path";
import { runMigrations } from "@launchpad/db";
import { loadConfig } from "./config.ts";

// Migration process (`node dist/migrate.js`, the platform's pre-deploy step): applies new migrations once,
// before the new release starts. Exit 0 lets the deploy continue; non-zero stops it and the old release
// keeps serving. JSON logs by hand until phase 6.
const log = (level: number, msg: string) =>
	console.log(JSON.stringify({ level, time: Date.now(), msg }));

const config = loadConfig();
// The build copies packages/db/migrations to dist/migrations (tsdown.config.ts), next to this file.
const migrationsFolder = path.join(import.meta.dirname, "migrations");

try {
	log(30, "applying migrations");
	await runMigrations(config.DATABASE_URL, migrationsFolder);
	log(30, "migrations applied");
} catch (error) {
	// Messages only, not the error objects (which can carry connection details). Drizzle wraps the
	// driver's error ("Failed query: ...") and keeps the real reason in `cause`.
	const reasons: string[] = [];
	for (let e: unknown = error; e instanceof Error; e = e.cause) {
		reasons.push(e.message);
	}
	log(
		50,
		`migration failed: ${reasons.join(" <- caused by: ") || String(error)}`,
	);
	process.exit(1);
}
