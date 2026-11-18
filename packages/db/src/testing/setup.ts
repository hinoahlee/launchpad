import { beforeEach } from "vitest";
import { truncateAll } from "./index.ts";

// Runs before every test in every file: each test starts from empty tables.
beforeEach(async () => {
	await truncateAll();
});
