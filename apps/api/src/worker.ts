import { createDb } from "@launchpad/db";
import { loadConfig } from "#config/load.ts";
import { directDatabaseUrl } from "#config/utils.ts";
import { createEmailDriver } from "#lib/email/driver/create.ts";
import { startScheduler } from "#lib/jobs/scheduler.ts";
import { startWorker } from "#lib/jobs/worker.ts";
import { createLogger } from "#lib/logger.ts";
import { flushSentry, initSentry } from "#lib/sentry.ts";
import { createStorageDriver } from "#lib/storage/driver/create.ts";

// Deploy contract: exit within 25 s of SIGTERM (the running handler gets 20 s of it).
const SHUTDOWN_TIMEOUT_MS = 25_000;

const config = loadConfig();
initSentry(config);
const log = createLogger(config.LOG_LEVEL);
// LISTEN needs a direct connection, not a transaction-mode pooler.
const db = createDb(directDatabaseUrl(config));

let worker: Awaited<ReturnType<typeof startWorker>>;
let scheduler: ReturnType<typeof startScheduler>;
try {
	worker = await startWorker({
		db,
		log,
		email: createEmailDriver(config, log),
		storage: createStorageDriver(config),
	});
	scheduler = startScheduler({ db, log });
} catch (err) {
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

	await scheduler.stop();
	await worker.stop();
	await db.$client.end({ timeout: 5 });
	await flushSentry();
	log.info("shutdown complete");
	process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
