import { beforeEach } from "vitest";
import { truncateAll } from "./database.ts";

// Each test starts from empty tables.
beforeEach(async () => {
	await truncateAll();
});
