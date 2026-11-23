import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { E2E_DATABASE_URL as DATABASE_URL } from "#support/database.ts";

// The app exactly as it ships: the production server serving the built web app, real CSP included.
const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CI = Boolean(process.env.CI);
const emptyDatabase = path.join(
	import.meta.dirname,
	"scripts/empty-database.ts",
);
// The fake bucket (scripts/fake-bucket.ts) the server stores files in.
const BUCKET_PORT = 3101;
const BUCKET_URL = `http://127.0.0.1:${BUCKET_PORT}`;
const fakeBucket = path.join(import.meta.dirname, "scripts/fake-bucket.ts");

export default defineConfig({
	testDir: "./tests",
	fullyParallel: true,
	forbidOnly: CI,
	// A test that passes on retry is "flaky": fix it, don't ignore it.
	retries: CI ? 2 : 0,
	// The suite takes about a minute: a run past 10 is stuck, not slow.
	globalTimeout: 10 * 60 * 1000,
	reporter: CI ? [["list", { printOnlyFailures: true }], ["html"]] : "html",
	use: {
		baseURL: BASE_URL,
		trace: "on-first-retry",
	},
	// Phone and desktop, both on Chromium (one browser to install).
	projects: [
		{ name: "mobile", use: { ...devices["Pixel 7"] } },
		{ name: "desktop", use: { ...devices["Desktop Chrome"] } },
	],
	webServer: [
		{
			command: `node ${fakeBucket} ${BUCKET_PORT} ${BASE_URL}`,
			url: `${BUCKET_URL}/health`,
			reuseExistingServer: !CI,
		},
		{
			// An empty database, then the shipped migrate bundle (as a deploy runs it), then the server.
			command: `node ${emptyDatabase} ${DATABASE_URL} && node dist/migrate.js && node dist/server.js`,
			cwd: "../apps/api",
			url: `${BASE_URL}/api/health`,
			env: {
				NODE_ENV: "production",
				PORT: String(PORT),
				LOG_LEVEL: "warn",
				DATABASE_URL,
				// One trusted proxy hop: tests send X-Forwarded-For to get their own per-IP limits.
				TRUST_PROXY_HOPS: "1",
				APP_URL: BASE_URL,
				BETTER_AUTH_SECRET: "e2e-only-secret-not-used-anywhere-else",
				// Made up: tests stop the browser before it reaches Google.
				GOOGLE_CLIENT_ID: "e2e.apps.googleusercontent.com",
				GOOGLE_CLIENT_SECRET: "e2e-not-a-real-secret",
				// File storage in the fake bucket. Made-up keys: it doesn't check signatures.
				S3_ENDPOINT: BUCKET_URL,
				S3_BUCKET: "launchpad-e2e",
				S3_ACCESS_KEY_ID: "e2e",
				S3_SECRET_ACCESS_KEY: "e2e-not-a-real-secret",
			},
			reuseExistingServer: !CI,
			stdout: "ignore",
			stderr: "pipe",
		},
	],
});
