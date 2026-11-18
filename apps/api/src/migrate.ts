import { runMigrations } from "@launchpad/db";
import { loadConfig } from "./config.ts";

// Migration process. Deploys run `node dist/migrate.js` (the platform's pre-deploy step) once, before the
// new release starts; `pnpm db:migrate` runs this same file from source against your local database.
// Exit 0 lets the deploy continue; non-zero stops it and the old release keeps serving. JSON logs by hand
// until phase 6.
const log = (level: number, msg: string) =>
	console.log(JSON.stringify({ level, time: Date.now(), msg }));

const config = loadConfig();

try {
	log(30, "applying migrations");
	const { applied, total } = await runMigrations(config.DATABASE_URL);
	// The deploy log's proof of what this release changed: "applied 1" before the new code starts.
	log(
		30,
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
	log(
		50,
		`migration failed: ${reasons.join(" <- caused by: ") || String(error)}`,
	);
	process.exit(1);
}
