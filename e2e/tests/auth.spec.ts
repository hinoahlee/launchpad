import { expect, test } from "#support/fixtures.ts";

// Google itself can't take part in a test (a real account, a real login). These check our half of the flow:
// the button starts it with the right values, and a failed sign-in comes back to a readable message.

test("the header links visitors to the sign-in page", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("link", { name: "Sign in" }).click();
	await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
});

test("Continue with Google sends the browser to Google", async ({ page }) => {
	// Stop at Google's door: answer for Google with a blank page, and keep the URL the browser was sent to.
	let googleUrl: URL | undefined;
	await page.route("https://accounts.google.com/**", (route) => {
		googleUrl = new URL(route.request().url());
		return route.fulfill({ contentType: "text/html", body: "<p>Google</p>" });
	});

	await page.goto("/sign-in");
	await page.getByRole("button", { name: "Continue with Google" }).click();
	await expect(page).toHaveURL(/^https:\/\/accounts\.google\.com\//);

	// Google will send the person back to our callback, on the origin they started from.
	const origin = new URL(page.context().pages()[0]?.url() ?? "").origin;
	expect(origin).toBe("https://accounts.google.com");
	expect(googleUrl?.searchParams.get("redirect_uri")).toMatch(
		/\/api\/auth\/callback\/google$/,
	);
	expect(googleUrl?.searchParams.get("code_challenge")).toBeTruthy();
});

test("a cancelled sign-in comes back with a message", async ({ page }) => {
	// Where Better Auth sends the browser when the person presses Cancel at Google.
	await page.goto("/sign-in?error=access_denied");
	await expect(page.getByRole("alert")).toHaveText(/cancelled/);
	await expect(
		page.getByRole("button", { name: "Continue with Google" }),
	).toBeEnabled();
});

test("an unknown error code still gets a message", async ({ page }) => {
	await page.goto("/sign-in?error=something_new");
	await expect(page.getByRole("alert")).toHaveText(/Something went wrong/);
});
