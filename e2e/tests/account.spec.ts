import { ageSessions, userExists } from "#support/database.ts";
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

// A shared computer: the next person on the same tab must never see the last one's devices.
test("after signing out from the menu, the next user sees only their own devices", async ({
	page,
	browser,
}) => {
	const first = newEmail();
	await page.goto("/sign-in?redirect=/account");
	await signInWithCode(page, first);
	await expect(page).toHaveURL("/account");
	// Their second device, so their device list differs from the next user's.
	const phone = await browser.newContext({
		extraHTTPHeaders: { "x-forwarded-for": clientIp() },
		userAgent:
			"Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/130.0",
	});
	try {
		const phonePage = await phone.newPage();
		await phonePage.goto("/sign-in");
		await signInWithCode(phonePage, first);
		await expect(phonePage).toHaveURL("/");
	} finally {
		await phone.close();
	}
	await page.reload();
	await expect(page.getByText("Firefox on Android")).toBeVisible();

	await page.getByRole("button", { name: "Account", exact: true }).click();
	await page.getByRole("menuitem", { name: "Sign out" }).click();
	await expect(page).toHaveURL("/sign-in?redirect=%2Faccount");
	await signInWithCode(page, newEmail());

	await expect(page).toHaveURL("/account");
	await expect(page.getByText("This device")).toBeVisible();
	await expect(page.getByText("Firefox on Android")).toBeHidden();
});

test("Sign out on /account signs this device out", async ({ page }) => {
	await page.goto("/sign-in?redirect=/account");
	await signInWithCode(page, newEmail());
	await expect(page).toHaveURL("/account");

	await page.getByRole("button", { name: "Sign out" }).click();
	await expect(page).toHaveURL("/");
	await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("deleting the account signs out and removes it", async ({ page }) => {
	const email = newEmail();
	await page.goto("/sign-in?redirect=/account");
	await signInWithCode(page, email);
	await expect(page).toHaveURL("/account");

	await page.getByRole("button", { name: "Delete account" }).click();
	const dialog = page.getByRole("alertdialog");
	await expect(dialog).toContainText("Delete your account?");
	await dialog.getByRole("button", { name: "Delete account" }).click();

	await expect(page).toHaveURL("/");
	await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
	expect(await userExists(email)).toBe(false);
});

test.describe("with an old sign-in", () => {
	// The API refuses the first delete (400 SESSION_EXPIRED); the browser logs any 4xx as a console error.
	test.use({ expectedErrors: [/400 .*\/api\/auth\/delete-user/] });

	test("deleting after an old sign-in asks to sign in again first", async ({
		page,
	}) => {
		const email = newEmail();
		await page.goto("/sign-in?redirect=/account");
		await signInWithCode(page, email);
		await expect(page).toHaveURL("/account");
		await ageSessions(email, 60);

		await page.getByRole("button", { name: "Delete account" }).click();
		const dialog = page.getByRole("alertdialog");
		await dialog.getByRole("button", { name: "Delete account" }).click();
		await expect(dialog).toContainText("Sign in again first");
		await dialog.getByRole("button", { name: "Sign in again" }).click();

		// Signed out, then back on /account after a new sign-in, which is recent enough.
		await expect(page).toHaveURL("/sign-in?redirect=%2Faccount");
		await signInWithCode(page, email);
		await expect(page).toHaveURL("/account");
		await page.getByRole("button", { name: "Delete account" }).click();
		await page
			.getByRole("alertdialog")
			.getByRole("button", { name: "Delete account" })
			.click();
		await expect(page).toHaveURL("/");
		expect(await userExists(email)).toBe(false);
	});
});
