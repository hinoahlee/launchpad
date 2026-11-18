import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

// One pool of connections per process. Close it on shutdown with `db.$client.end()`.
export function createDb(databaseUrl: string) {
	return drizzle(postgres(databaseUrl), { schema });
}

export type Database = ReturnType<typeof createDb>;
