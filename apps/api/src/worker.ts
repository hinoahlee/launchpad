import { loadConfig } from "./config.ts";

// Background-job process (`node dist/worker.js`). A stub until phase 12 adds the job queue: it validates
// config like every entrypoint, then stays alive doing nothing, so platforms can already run it.

loadConfig();

const log = (msg: string) =>
	console.log(JSON.stringify({ level: 30, time: Date.now(), msg }));

// Node exits once nothing is scheduled; this timer keeps the process alive until a signal.
const keepAlive = setInterval(() => {}, 1 << 30);

function shutdown(signal: NodeJS.Signals): void {
	log(`worker stopping (${signal})`);
	clearInterval(keepAlive);
	process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

log("worker idle");
