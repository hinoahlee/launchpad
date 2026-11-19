import { test as base, expect } from "@playwright/test";

// What this does: while each test runs, it listens for errors in the browser (the ones you'd see in red in
// DevTools' Console). When the test ends, it fails if there were any, even when everything the test checked
// looked right.
//
// Why: a page can look fine and still be broken. If a script crashes, a request fails or our security headers
// block a file, the browser only reports it in the console. The page may be half-working, or broken in another
// browser or for another user, and no check like "the heading is visible" would notice.
//
// How to use it: import `test` and `expect` from this file instead of from @playwright/test. Every test then
// gets this check automatically; nothing to add to the test itself.
export const test = base.extend<{ failOnPageErrors: undefined }>({
	failOnPageErrors: [
		async ({ page }, use) => {
			// Before the test: collect uncaught errors and console.error messages as they happen.
			const errors: string[] = [];
			page.on("pageerror", (error) =>
				errors.push(`pageerror: ${error.message}`),
			);
			page.on("console", (message) => {
				if (message.type() === "error") {
					errors.push(
						`console.error: ${message.text()} (${message.location().url})`,
					);
				}
			});
			// The test runs here.
			await use(undefined);
			// After the test: fail if anything was collected, listing each error.
			expect(errors, "errors in the page or console").toEqual([]);
		},
		// `auto`: runs for every test, even though no test asks for `failOnPageErrors` by name.
		{ auto: true },
	],
});

export { expect };
