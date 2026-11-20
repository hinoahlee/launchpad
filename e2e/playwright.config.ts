import { defineConfig, devices } from "@playwright/test";

// The app exactly as it ships: the API's production server (dist/server.js) serving the built web app, with
// the real security headers. A CSP violation then shows up as a console error and fails the test.
// Turbo builds both apps first (`dependsOn: ["^build"]`).
const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CI = Boolean(process.env.CI);

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
	webServer: {
		// Migrate first, then serve: the same order as a deploy (pre-deploy migrate). Sign-in writes to the database.
		command: "node dist/migrate.js && node dist/server.js",
		cwd: "../apps/api",
		url: `${BASE_URL}/api/health`,
		env: {
			NODE_ENV: "production",
			PORT: String(PORT),
			LOG_LEVEL: "warn",
			// The Postgres from `pnpm db:up` (compose.dev.yml), which CI runs too. Sign-in stores its state there
			// (`verifications`), so the command above migrates it first.
			DATABASE_URL: "postgres://launchpad:launchpad@localhost:5433/launchpad",
			// Required in production. The origin the tests browse; a throwaway secret (this server holds no real users).
			APP_URL: BASE_URL,
			BETTER_AUTH_SECRET: "e2e-only-secret-not-used-anywhere-else",
			// A made-up Google client: enough for the sign-in button to start the flow. Tests stop the browser at
			// Google's door (tests/auth.spec.ts), so Google never sees these.
			GOOGLE_CLIENT_ID: "e2e.apps.googleusercontent.com",
			GOOGLE_CLIENT_SECRET: "e2e-not-a-real-secret",
		},
		// Locally, reuse a server you already started on the port; CI always starts a fresh one.
		reuseExistingServer: !CI,
		stdout: "ignore",
		stderr: "pipe",
	},
});
