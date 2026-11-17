import { defineConfig } from "drizzle-kit";

// `generate` works offline (schema.ts vs. the last snapshot in migrations/meta); only `studio` connects.
// The scripts load DATABASE_URL from apps/api/.env.
const url = process.env.DATABASE_URL;

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/schema.ts",
	out: "./migrations",
	...(url ? { dbCredentials: { url } } : {}),
});
