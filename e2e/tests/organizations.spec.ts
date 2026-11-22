import { expect, test } from "#support/fixtures.ts";
import { newEmail, signInWithCode } from "#support/sign-in.ts";

test("a new account starts in a personal organization, then creates and switches", async ({
	page,
}) => {
	await page.goto("/sign-in?redirect=/account");
	await signInWithCode(page, newEmail());
	await expect(page).toHaveURL("/account");

	const card = page
		.locator("[data-slot=card]")
		.filter({ has: page.getByRole("heading", { name: "Organizations" }) });
	const row = (name: string) =>
		card.getByRole("listitem").filter({ hasText: name });

	// Made at sign-up, owned by the new user, and active.
	await expect(row("Personal")).toContainText("Active");
	await expect(row("Personal")).toContainText("Owner");

	// Creating one makes it active.
	await card.getByLabel("New organization").fill("Acme");
	await card.getByRole("button", { name: "Create" }).click();
	await expect(row("Acme")).toContainText("Active");
	await expect(row("Personal")).not.toContainText("Active");

	// Switching back, and it sticks across a reload (it's stored on the session, in the database).
	await row("Personal").getByRole("button", { name: "Switch" }).click();
	await expect(row("Personal")).toContainText("Active");
	await page.reload();
	await expect(row("Personal")).toContainText("Active");
	await expect(row("Acme")).not.toContainText("Active");
});
