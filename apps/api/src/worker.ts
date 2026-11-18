import { loadConfig } from "./config.ts";
import { createLogger } from "./lib/logger.ts";

// Background-job process (`node dist/worker.js`). A stub until phase 8 adds the job queue: it validates
// config like every entrypoint, then stays alive doing nothing, so platforms can already run it.

const config = loadConfig();
const log = createLogger(config.LOG_LEVEL);

// Node exits once nothing is scheduled; this timer keeps the process alive until a signal.
const keepAlive = setInterval(() => {}, 1 << 30);

function shutdown(signal: NodeJS.Signals): void {
	log.info({ signal }, "worker stopping");
	clearInterval(keepAlive);
	process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

log.info("worker idle");
