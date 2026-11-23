import { defineConfig } from "drizzle-kit";

// `generate` works offline; only `studio` connects (DATABASE_URL from apps/api/.env).
const url = process.env.DATABASE_URL;

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/schema/index.ts",
	out: "./migrations",
	...(url ? { dbCredentials: { url } } : {}),
});
