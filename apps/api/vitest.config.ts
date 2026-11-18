import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globalSetup: ["src/testing/global-setup.ts"],
		setupFiles: ["src/testing/setup.ts"],
		// Every file shares the one test database, which setup.ts empties before each test: one file at a time.
		fileParallelism: false,
	},
});
