import { createDb } from "@launchpad/db";
import { directDatabaseUrl, loadConfig } from "./config.ts";
import { createEmailDriver } from "./lib/email/create-driver.ts";
import { startScheduler } from "./lib/jobs/scheduler.ts";
import { startWorker } from "./lib/jobs/worker.ts";
import { createLogger } from "./lib/logger.ts";
import { flushSentry, initSentry } from "./lib/sentry.ts";

// Background-job process (`node dist/worker.js`): claims jobs from the `jobs` table and runs their handlers, and
// queues recurring jobs (schedules.ts). Run one or many: each job and each scheduled run happens once.

// Deploy contract: exit within 25 s of SIGTERM, before the platform's SIGKILL. The worker gives its running
// handler 20 s of that to stop.
const SHUTDOWN_TIMEOUT_MS = 25_000;

const config = loadConfig();
initSentry(config);
const log = createLogger(config.LOG_LEVEL);
// Direct, not through a transaction-mode pooler: LISTEN needs a connection of its own (config.ts).
const db = createDb(directDatabaseUrl(config));

let worker: Awaited<ReturnType<typeof startWorker>>;
let scheduler: ReturnType<typeof startScheduler>;
try {
	worker = await startWorker({
		db,
		log,
		email: createEmailDriver(config, log),
	});
	scheduler = startScheduler({ db, log });
} catch (err) {
	// Most likely the database is unreachable. Exit non-zero: the platform restarts the process.
	log.fatal({ err }, "failed to start");
	await flushSentry();
	process.exit(1);
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
	log.info({ signal }, "shutting down");

	const timer = setTimeout(() => {
		log.error("shutdown timed out, forcing exit");
		process.exit(1);
	}, SHUTDOWN_TIMEOUT_MS);
	timer.unref();

	// Stop queuing scheduled runs (another worker, or this one after the deploy, queues any we miss). Then stop
	// claiming, abort the running handler and hand its job back (or leave it to its lease).
	await scheduler.stop();
	await worker.stop();
	await db.$client.end({ timeout: 5 });
	await flushSentry();
	log.info("shutdown complete");
	process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
