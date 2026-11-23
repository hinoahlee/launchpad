import { runMigrations } from "@launchpad/db";
import { loadConfig } from "#config/load.ts";
import { directDatabaseUrl } from "#config/utils.ts";
import { createLogger } from "#lib/logger.ts";

// Run once before a new release starts. Non-zero exit stops the deploy; the old release keeps serving.
const config = loadConfig();
const log = createLogger(config.LOG_LEVEL);

try {
	log.info("applying migrations");
	const { applied, total } = await runMigrations(directDatabaseUrl(config));
	log.info(
		applied > 0
			? `migrations applied: ${applied} new (${total} total)`
			: `database up to date: no new migrations (${total} total)`,
	);
} catch (error) {
	// Messages only: error objects can carry connection details. Drizzle keeps the real reason in `cause`.
	const reasons: string[] = [];
	for (let e: unknown = error; e instanceof Error; e = e.cause) {
		reasons.push(e.message);
	}
	log.error(
		`migration failed: ${reasons.join(" <- caused by: ") || String(error)}`,
	);
	process.exit(1);
}
