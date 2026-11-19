import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

// One pool of connections per process (postgres.js: up to 10, each opened when a query finds none free, kept
// open and reused, replaced after 30-60 min).
// Close it on shutdown with `db.$client.end()`.
export function createDb(databaseUrl: string) {
	// connect_timeout (seconds, default 30): give up on a connection that doesn't open, so an unreachable
	// database fails requests quickly instead of piling them up.
	return drizzle(postgres(databaseUrl, { connect_timeout: 5 }), { schema });
}

export type Database = ReturnType<typeof createDb>;

// The `tx` handed to `db.transaction(async (tx) => ...)`. Functions that write take `Database | Transaction`,
// so the caller decides whether the write joins a larger transaction.
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
