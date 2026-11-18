import { runMigrations } from "@launchpad/db";
import { loadConfig } from "./config.ts";
import { createLogger } from "./lib/logger.ts";

// Migration process. Deploys run `node dist/migrate.js` (the platform's pre-deploy step) once, before the
// new release starts; `pnpm db:migrate` runs this same file from source against your local database.
// Exit 0 lets the deploy continue; non-zero stops it and the old release keeps serving.
const config = loadConfig();
const log = createLogger(config.LOG_LEVEL);

try {
	log.info("applying migrations");
	const { applied, total } = await runMigrations(config.DATABASE_URL);
	// The deploy log's proof of what this release changed: "applied 1" before the new code starts.
	log.info(
		applied > 0
			? `migrations applied: ${applied} new (${total} total)`
			: `database up to date: no new migrations (${total} total)`,
	);
} catch (error) {
	// Messages only, not the error objects (which can carry connection details). Drizzle wraps the
	// driver's error ("Failed query: ...") and keeps the real reason in `cause`.
	const reasons: string[] = [];
	for (let e: unknown = error; e instanceof Error; e = e.cause) {
		reasons.push(e.message);
	}
	log.error(
		`migration failed: ${reasons.join(" <- caused by: ") || String(error)}`,
	);
	process.exit(1);
}
