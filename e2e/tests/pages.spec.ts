import { expect, test } from "#support/fixtures.ts";

// Smoke tests: each public page loads and shows what it should, on a phone and a desktop (the two projects in
// playwright.config.ts). Cheap to run; they catch a broken build, route, header or bundle before users do.
const pages = [
	{ path: "/", heading: "Launchpad", title: "Launchpad" },
	{
		path: "/privacy",
		heading: "Privacy policy",
		title: "Privacy policy · Launchpad",
	},
	{
		path: "/terms",
		heading: "Terms of service",
		title: "Terms of service · Launchpad",
	},
];

for (const { path, heading, title } of pages) {
	test(`${path} renders`, async ({ page }) => {
		await page.goto(path);
		await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
		await expect(page).toHaveTitle(title);
		// No sideways scrolling: the page fits the screen's width.
		const overflows = await page.evaluate(
			() => document.documentElement.scrollWidth > window.innerWidth,
		);
		expect(overflows).toBe(false);
	});
}

test("an unknown URL shows the 404 page", async ({ page }) => {
	await page.goto("/no/such/page");
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(
		"Page not found",
	);
	await page.getByRole("link", { name: "Back to home" }).click();
	await expect(page).toHaveURL("/");
});

test("the footer links to the legal pages", async ({ page }) => {
	await page.goto("/");
	const legal = page.getByRole("navigation", { name: "Legal" });
	await legal.getByRole("link", { name: "Privacy" }).click();
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(
		"Privacy policy",
	);
	await legal.getByRole("link", { name: "Terms" }).click();
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(
		"Terms of service",
	);
});

test("the landing page's calls to action are links", async ({ page }) => {
	await page.goto("/");
	// They look like buttons but must stay links, so screen readers announce them as links.
	for (const name of ["View on GitHub", "Read the roadmap"]) {
		await expect(page.getByRole("link", { name })).toBeVisible();
	}
});

test("the landing page shows the API is up", async ({ page }) => {
	await page.goto("/");
	// Through the real /api/health, parsed with the shared schema.
	await expect(page.getByText(/^OK · build /)).toBeVisible();
});

test("the chosen theme survives a reload", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Change theme" }).click();
	await page.getByRole("menuitem", { name: "Dark" }).click();
	await expect(page.locator("html")).toHaveClass(/\bdark\b/);
	await page.reload();
	await expect(page.locator("html")).toHaveClass(/\bdark\b/);
});

test("touch targets are at least 44px on a phone", async ({
	page,
}, testInfo) => {
	test.skip(testInfo.project.name !== "mobile", "touch screens only");
	await page.goto("/");
	await expect(page.getByText(/^OK · build /)).toBeVisible();
	const targets = page.locator("a:visible, button:visible");
	const tooSmall: string[] = [];
	for (const target of await targets.all()) {
		const box = await target.boundingBox();
		if (box && (box.width < 44 || box.height < 44)) {
			const name =
				(await target.getAttribute("aria-label")) ??
				(await target.textContent());
			tooSmall.push(`${name?.trim()}: ${box.width}×${box.height}`);
		}
	}
	expect(tooSmall).toEqual([]);
});
