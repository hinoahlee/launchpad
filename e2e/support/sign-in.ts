import { randomInt, randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { sentSignInCode } from "./database.ts";

// A made-up client IP, sent as X-Forwarded-For (the e2e server trusts one proxy hop). Better Auth allows 3 codes
// a minute per IP; each test gets its own (fixtures.ts), so tests, retries and reruns never share 127.0.0.1's
// budget. A second browser in a test passes its own.
export const clientIp = () =>
	`10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

// A fresh address per test, so tests never share a user.
export const newEmail = () => `e2e-${randomUUID()}@example.com`;

// Signs in with an emailed code, on a page that's already showing the sign-in card. The code is read from the
// queued send_email job (no worker runs in e2e, so nothing is sent).
export async function signInWithCode(page: Page, email: string) {
	await page.getByLabel("Email").fill(email);
	await page.getByRole("button", { name: "Email me a code" }).click();
	await expect(
		page.getByText(`We sent a 6-digit code to ${email}`),
	).toBeVisible();
	await page.getByLabel("Code").fill(await sentSignInCode(email));
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
