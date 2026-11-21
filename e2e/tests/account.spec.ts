import { expect, test } from "#support/fixtures.ts";
import { clientIp, newEmail, signInWithCode } from "#support/sign-in.ts";

test("/account sends visitors to sign in, then back to /account", async ({
	page,
}) => {
	const email = newEmail();
	await page.goto("/account");
	await expect(page).toHaveURL("/sign-in?redirect=%2Faccount");

	await signInWithCode(page, email);
	await expect(page).toHaveURL("/account");
	await expect(page.getByRole("heading", { level: 1 })).toHaveText("Account");
	await expect(page.getByText(email)).toBeVisible();
	await expect(page.getByText("This device")).toBeVisible();
});

test("signing out another device from /account", async ({ page, browser }) => {
	const email = newEmail();
	await page.goto("/sign-in?redirect=/account");
	await signInWithCode(page, email);
	await expect(page.getByText("This device")).toBeVisible();

	// A second browser (its own cookies and IP) signs in to the same account: "the phone".
	const phone = await browser.newContext({
		extraHTTPHeaders: { "x-forwarded-for": clientIp() },
		userAgent:
			"Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/130.0",
	});
	try {
		const phonePage = await phone.newPage();
		await phonePage.goto("/sign-in");
		await signInWithCode(phonePage, email);
		await expect(phonePage).toHaveURL("/");

		// It shows up on the first device's list, and gets signed out from there.
		await page.reload();
		const row = page.getByRole("listitem").filter({
			hasText: "Firefox on Android",
		});
		await row.getByRole("button", { name: "Sign out" }).click();
		await expect(row).toBeHidden();

		// The phone's session is gone: the API no longer knows it.
		const res = await phone.request.get("/api/account/sessions");
		expect(res.status()).toBe(401);
	} finally {
		await phone.close();
	}
});

test("Sign out on /account signs this device out", async ({ page }) => {
	await page.goto("/sign-in?redirect=/account");
	await signInWithCode(page, newEmail());
	await expect(page).toHaveURL("/account");

	await page.getByRole("button", { name: "Sign out" }).click();
	await expect(page).toHaveURL("/");
	await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});
