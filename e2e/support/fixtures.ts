import { test as base, expect } from "@playwright/test";

// Import `test` and `expect` from here, not from @playwright/test: every test then also fails on an uncaught
// error in the page or any console error, including CSP violations ("Refused to load...") and failed requests.
// A page that "looks fine" but logs errors is broken for someone.
export const test = base.extend<{ failOnPageErrors: undefined }>({
	failOnPageErrors: [
		async ({ page }, use) => {
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
			await use(undefined);
			expect(errors, "errors in the page or console").toEqual([]);
		},
		// Runs for every test without being asked for.
		{ auto: true },
	],
});

export { expect };
