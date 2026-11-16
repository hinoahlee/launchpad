import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";

// Deploy contract: exit within 25 s of SIGTERM, before the platform's SIGKILL.
const SHUTDOWN_TIMEOUT_MS = 25_000;

const config = loadConfig();
const app = buildApp(config);

async function shutdown(signal: NodeJS.Signals): Promise<void> {
	app.log.info({ signal }, "shutting down");

	const timer = setTimeout(() => {
		app.log.error("shutdown timed out, forcing exit");
		process.exit(1);
	}, SHUTDOWN_TIMEOUT_MS);
	timer.unref();

	// Stops accepting connections, waits for in-flight requests, runs onClose hooks.
	await app.close();
	app.log.info("shutdown complete");
	process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

try {
	// 0.0.0.0: reachable from outside a container, not just from inside it.
	await app.listen({ port: config.PORT, host: "0.0.0.0" });
} catch (err) {
	app.log.fatal({ err }, "failed to start");
	process.exit(1);
}
