import { truncateAll } from "@launchpad/db/testing";
import { beforeEach } from "vitest";

// Each test starts from empty tables.
beforeEach(async () => {
	await truncateAll();
});
