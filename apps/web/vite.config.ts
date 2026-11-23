import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Source maps are generated and uploaded only when CI passes a Sentry token (main builds).
const { SENTRY_AUTH_TOKEN, VITE_GIT_SHA } = process.env;
const uploadSourceMaps = Boolean(SENTRY_AUTH_TOKEN);

function required(name: string): string {
	const value = process.env[name];
	if (!value)
		throw new Error(`${name} is required when SENTRY_AUTH_TOKEN is set`);
	return value;
}

export default defineConfig({
	build: {
		// "hidden": the bundle doesn't reference them; the plugin deletes them after upload.
		sourcemap: uploadSourceMaps ? "hidden" : false,
	},
	plugins: [
		// Before react(). Writes src/routeTree.gen.ts from src/routes/.
		tanstackRouter({ target: "react", autoCodeSplitting: true }),
		react(),
		tailwindcss(),
		// Last, as Sentry asks.
		uploadSourceMaps &&
			sentryVitePlugin({
				authToken: required("SENTRY_AUTH_TOKEN"),
				org: required("SENTRY_ORG"),
				project: required("SENTRY_PROJECT"),
				release: VITE_GIT_SHA ? { name: VITE_GIT_SHA } : {},
				sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
			}),
	],
	server: {
		// One origin, as in production. 127.0.0.1: localhost may resolve to ::1, and the API listens on IPv4.
		proxy: { "/api": "http://127.0.0.1:3000" },
	},
});
