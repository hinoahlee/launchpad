import { loadConfig } from "./config.ts";

// Migration process (`node dist/migrate.js`): runs once before a new release starts, exits 0 on success and
// non-zero on failure so the platform can stop the deploy. A stub until phase 5 adds the database: it only
// validates config (loadConfig exits 1 if it's invalid).

loadConfig();
console.log(
	JSON.stringify({
		level: 30,
		time: Date.now(),
		msg: "no migrations yet",
	}),
);
