import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globalSetup: ["src/testing/global-setup.ts"],
		setupFiles: ["src/testing/setup.ts"],
		// One shared test database, emptied before each test.
		fileParallelism: false,
	},
});
