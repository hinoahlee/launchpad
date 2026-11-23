import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, test } from "#support/fixtures.ts";
import { newEmail, signInWithCode } from "#support/sign-in.ts";

// The real flow against the fake bucket (scripts/fake-bucket.ts): the API signs URLs, the browser PUTs to the
// bucket's origin (so the CSP and the bucket's CORS both have to allow it), the API checks the size there.
const filesCard = (page: Page) =>
	page
		.locator("[data-slot=card]")
		.filter({ has: page.getByRole("heading", { name: "Files" }) });

async function signInToAccount(page: Page) {
	await page.goto("/sign-in?redirect=/account");
	await signInWithCode(page, newEmail());
	await expect(page).toHaveURL("/account");
}

test("upload, download and delete a file", async ({ page }) => {
	await signInToAccount(page);
	const card = filesCard(page);
	await expect(card.getByText("No files yet.")).toBeVisible();

	await card.getByLabel("Choose a file to upload").setInputFiles({
		name: "résumé notes.txt",
		mimeType: "text/plain",
		buffer: Buffer.from("hello world"),
	});
	await expect(card.getByText("résumé notes.txt")).toBeVisible();
	await expect(card.getByText("11 B")).toBeVisible();

	// The bucket answers as an attachment, under the name it was uploaded with, with the same bytes.
	const downloading = page.waitForEvent("download");
	await card.getByRole("button", { name: "Download résumé notes.txt" }).click();
	const download = await downloading;
	expect(download.suggestedFilename()).toBe("résumé notes.txt");
	expect(await readFile(await download.path(), "utf8")).toBe("hello world");
	await expect(page).toHaveURL("/account");

	await card.getByRole("button", { name: "Delete résumé notes.txt" }).click();
	await expect(card.getByText("No files yet.")).toBeVisible();
});

test("a file over the limit is refused before uploading", async ({ page }) => {
	await signInToAccount(page);
	const card = filesCard(page);
	let registered = false;
	page.on("request", (request) => {
		if (request.method() === "POST" && request.url().endsWith("/api/files")) {
			registered = true;
		}
	});

	await card.getByLabel("Choose a file to upload").setInputFiles({
		name: "huge.bin",
		mimeType: "application/octet-stream",
		buffer: Buffer.alloc(25 * 1024 * 1024 + 1),
	});
	await expect(
		card.getByText("That file is too big. The limit is 25 MB."),
	).toBeVisible();
	expect(registered).toBe(false);
	await expect(card.getByText("No files yet.")).toBeVisible();
});
