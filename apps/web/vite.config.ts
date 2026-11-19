import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Source maps go to Sentry only when CI provides a token (main-branch image builds). Elsewhere (dev, PRs, a
// local `pnpm build`) none are generated and nothing is uploaded.
const { SENTRY_AUTH_TOKEN, VITE_GIT_SHA } = process.env;
const uploadSourceMaps = Boolean(SENTRY_AUTH_TOKEN);

// A token without org/project is a half-done CI setup: fail the build rather than skip the upload silently.
function required(name: string): string {
	const value = process.env[name];
	if (!value)
		throw new Error(`${name} is required when SENTRY_AUTH_TOKEN is set`);
	return value;
}

export default defineConfig({
	build: {
		// "hidden": maps are written but the bundle doesn't point to them, so browsers never ask for them. The
		// plugin deletes them after upload, so they aren't in the image either.
		sourcemap: uploadSourceMaps ? "hidden" : false,
	},
	plugins: [
		// Before react(): it writes src/routeTree.gen.ts from src/routes/ and splits each route into its own chunk,
		// loaded when first visited.
		tanstackRouter({ target: "react", autoCodeSplitting: true }),
		react(),
		tailwindcss(),
		// Last, as Sentry's docs ask: it reads the final output of the other plugins.
		uploadSourceMaps &&
			sentryVitePlugin({
				authToken: required("SENTRY_AUTH_TOKEN"),
				org: required("SENTRY_ORG"),
				project: required("SENTRY_PROJECT"),
				// The same name the SDK reports (src/lib/sentry.ts), so errors and maps meet in one release.
				release: VITE_GIT_SHA ? { name: VITE_GIT_SHA } : {},
				sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
			}),
	],
	server: {
		// Dev only: forward /api to the API so the browser sees one origin, as in production.
		// 127.0.0.1, not localhost: the API listens on IPv4 and localhost may resolve to ::1 first.
		proxy: { "/api": "http://127.0.0.1:3000" },
	},
});
