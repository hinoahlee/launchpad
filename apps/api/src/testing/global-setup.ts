import { resetTestDatabase } from "@launchpad/db/testing";

export async function setup(): Promise<void> {
	await resetTestDatabase();
}
