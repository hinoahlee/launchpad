import { truncateAll } from "@launchpad/db/testing";
import { beforeEach } from "vitest";

// Runs before every test in every file: each test starts from empty tables.
beforeEach(async () => {
	await truncateAll();
});
