import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

// One pool of connections per process (postgres.js: up to 10, opened on first use, closed after idling).
// Close it on shutdown with `db.$client.end()`.
export function createDb(databaseUrl: string) {
	// connect_timeout (seconds, default 30): give up on a connection that doesn't open, so an unreachable
	// database fails requests quickly instead of piling them up.
	return drizzle(postgres(databaseUrl, { connect_timeout: 5 }), { schema });
}

export type Database = ReturnType<typeof createDb>;
