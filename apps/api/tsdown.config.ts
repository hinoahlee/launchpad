import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		server: "src/server.ts",
		worker: "src/worker.ts",
		migrate: "src/migrate.ts",
	},
	platform: "node",
	target: "node24",
	fixedExtension: false,
	sourcemap: true,
	deps: {
		// Workspace packages export raw .ts, which Node won't type-strip under node_modules: bundle them. Their npm
		// dependencies must then be listed in this package.json too.
		alwaysBundle: [/^@launchpad\//],
		// npm packages stay external; the build fails if one would be bundled (e.g. missing from dependencies).
		onlyBundle: [],
	},
});
