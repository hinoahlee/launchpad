import { defineConfig } from "tsdown";

export default defineConfig({
	// One output file per process the deploy contract names.
	entry: {
		server: "src/server.ts",
		worker: "src/worker.ts",
		migrate: "src/migrate.ts",
	},
	platform: "node",
	target: "node24",
	fixedExtension: false, // dist/server.js, not .mjs (package.json already says "type": "module")
	sourcemap: true, // stack traces point at src/*.ts lines (with `node --enable-source-maps`)
	deps: {
		// Only our own code goes in the bundle. npm packages stay external (imported from node_modules at
		// runtime), and the build fails if one would be bundled, e.g. because it's missing from dependencies.
		onlyBundle: [],
	},
});
