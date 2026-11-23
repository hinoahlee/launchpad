import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.ts";

// One pool per process. Close it on shutdown: `db.$client.end()`.
export function createDb(databaseUrl: string) {
	// connect_timeout (s): an unreachable database fails requests fast instead of piling them up.
	return drizzle(postgres(databaseUrl, { connect_timeout: 5 }), { schema });
}

export type Database = ReturnType<typeof createDb>;

// Functions that write take `Database | Transaction`, so the caller decides whether they join a transaction.
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
