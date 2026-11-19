import { createDb } from "@launchpad/db";
import { loadConfig } from "./config.ts";
import { startWorker } from "./lib/jobs/worker.ts";
import { createLogger } from "./lib/logger.ts";
import { flushSentry, initSentry } from "./lib/sentry.ts";

// Background-job process (`node dist/worker.js`): claims jobs from the `jobs` table and runs their handlers.

// Deploy contract: exit within 25 s of SIGTERM, before the platform's SIGKILL. The worker gives its running
// handler 20 s of that to stop.
const SHUTDOWN_TIMEOUT_MS = 25_000;

const config = loadConfig();
initSentry(config);
const log = createLogger(config.LOG_LEVEL);
const db = createDb(config.DATABASE_URL);

let worker: Awaited<ReturnType<typeof startWorker>>;
try {
	worker = await startWorker({ db, log });
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

	// Stops claiming, aborts the running handler and hands its job back (or leaves it to its lease).
	await worker.stop();
	await db.$client.end({ timeout: 5 });
	await flushSentry();
	log.info("shutdown complete");
	process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
