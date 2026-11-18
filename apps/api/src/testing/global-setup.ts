import { resetTestDatabase } from "@launchpad/db/testing";

// Vitest runs this once, before any test file: a fresh schema built from the committed migrations.
export async function setup(): Promise<void> {
	await resetTestDatabase();
}
