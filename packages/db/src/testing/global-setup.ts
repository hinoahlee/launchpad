import { resetTestDatabase } from "./database.ts";

export async function setup(): Promise<void> {
	await resetTestDatabase();
}
