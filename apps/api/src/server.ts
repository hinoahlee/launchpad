import { loadConfig } from "#config/load.ts";
import { flushSentry, initSentry } from "#lib/sentry.ts";
import { buildApp } from "./app.ts";

// Deploy contract: exit within 25 s of SIGTERM.
const SHUTDOWN_TIMEOUT_MS = 25_000;

const config = loadConfig();
initSentry(config);
const app = buildApp(config);

async function shutdown(signal: NodeJS.Signals): Promise<void> {
	app.log.info({ signal }, "shutting down");

	const timer = setTimeout(() => {
		app.log.error("shutdown timed out, forcing exit");
		process.exit(1);
	}, SHUTDOWN_TIMEOUT_MS);
	timer.unref();

	await app.close();
	await flushSentry();
	app.log.info("shutdown complete");
	process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

try {
	// 0.0.0.0: reachable from outside the container.
	await app.listen({ port: config.PORT, host: "0.0.0.0" });
} catch (err) {
	app.log.fatal({ err }, "failed to start");
	process.exit(1);
}
