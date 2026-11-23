import { randomInt, randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { sentSignInCode } from "./database.ts";

// Sent as X-Forwarded-For (the e2e server trusts one hop): each test gets its own per-IP sign-in budget.
export const clientIp = () =>
	`10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

// A fresh address per test, so tests never share a user.
export const newEmail = () => `e2e-${randomUUID()}@example.com`;

// On a page already showing the sign-in card. No worker runs in e2e: the code is read from the queued job.
export async function signInWithCode(page: Page, email: string) {
	await page.getByLabel("Email").fill(email);
	await page.getByRole("button", { name: "Email me a code" }).click();
	await expect(
		page.getByText(`We sent a 6-digit code to ${email}`),
	).toBeVisible();
	await page.getByLabel("Code").fill(await sentSignInCode(email));
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
