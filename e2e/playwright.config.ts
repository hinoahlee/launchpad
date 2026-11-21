import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { E2E_DATABASE_URL as DATABASE_URL } from "./support/database.ts";

// The app exactly as it ships: the API's production server (dist/server.js) serving the built web app, with
// the real security headers. A CSP violation then shows up as a console error and fails the test.
// Turbo builds both apps first (`dependsOn: ["^build"]`).
const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CI = Boolean(process.env.CI);
const emptyDatabase = path.join(
	import.meta.dirname,
	"support/empty-database.ts",
);
// The fake bucket (support/fake-bucket.ts) the server stores files in.
const BUCKET_PORT = 3101;
const BUCKET_URL = `http://127.0.0.1:${BUCKET_PORT}`;
const fakeBucket = path.join(import.meta.dirname, "support/fake-bucket.ts");

// Starts from Playwright's own template (`npm init playwright`); changes are commented.
export default defineConfig({
	testDir: "./tests",
	fullyParallel: true,
	// Fail CI if a `test.only` was left in.
	forbidOnly: CI,
	// Retry on CI only. A test that passes on retry is reported as "flaky": fix it, don't ignore it.
	retries: CI ? 2 : 0,
	globalTimeout: 10 * 60 * 1000, // template: 1 hour; this suite takes about a minute
	reporter: CI ? [["list", { printOnlyFailures: true }], ["html"]] : "html",
	use: {
		baseURL: BASE_URL,
		trace: "on-first-retry",
	},
	// The phone and desktop layouts (template: three desktop browsers). Both run on Chromium, so CI installs one
	// browser. Pixel 7: a 412px touch screen, so `pointer: coarse` and the 44px touch targets apply.
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
				// As if one proxy sat in front (like Render's): a test can then send X-Forwarded-For to appear as its
				// own client IP, so the per-IP sign-in limits (3 codes a minute) don't make tests trip each other.
				TRUST_PROXY_HOPS: "1",
				// Required in production. The origin the tests browse; a throwaway secret (this server holds no real users).
				APP_URL: BASE_URL,
				BETTER_AUTH_SECRET: "e2e-only-secret-not-used-anywhere-else",
				// A made-up Google client: enough for the sign-in button to start the flow. Tests stop the browser at
				// Google's door (tests/auth.spec.ts), so Google never sees these.
				GOOGLE_CLIENT_ID: "e2e.apps.googleusercontent.com",
				GOOGLE_CLIENT_SECRET: "e2e-not-a-real-secret",
				// File storage in the fake bucket. Made-up keys: it doesn't check signatures.
				S3_ENDPOINT: BUCKET_URL,
				S3_BUCKET: "launchpad-e2e",
				S3_ACCESS_KEY_ID: "e2e",
				S3_SECRET_ACCESS_KEY: "e2e-not-a-real-secret",
			},
			// Locally, reuse a server you already started on the port; CI always starts a fresh one.
			reuseExistingServer: !CI,
			stdout: "ignore",
			stderr: "pipe",
		},
	],
});
