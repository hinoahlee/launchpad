import { test as base, expect } from "@playwright/test";
import { clientIp } from "./sign-in.ts";

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
//
// A test that provokes an error on purpose (a request the API refuses, and the browser logs) lists it:
// `test.use({ expectedErrors: [/delete-user/] })`. Each pattern must match one of the collected lines; others
// still fail the test.
export const test = base.extend<{
	expectedErrors: RegExp[];
	failOnPageErrors: undefined;
	ownClientIp: undefined;
}>({
	expectedErrors: [[], { option: true }],
	// Every test's browser appears to the server as its own client IP (see clientIp). Auto, like the check below.
	// Only on requests to our server: on a cross-origin request (the bucket) the extra header would need the
	// bucket's CORS to allow it, and real browsers never send it.
	ownClientIp: [
		async ({ context, baseURL }, use) => {
			const ip = clientIp();
			await context.route(`${baseURL}/**`, (route) =>
				route.continue({
					headers: { ...route.request().headers(), "x-forwarded-for": ip },
				}),
			);
			await use(undefined);
		},
		{ auto: true },
	],
	failOnPageErrors: [
		async ({ page, expectedErrors }, use) => {
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
			const unexpected = errors.filter(
				(error) => !expectedErrors.some((pattern) => pattern.test(error)),
			);
			expect(unexpected, "errors in the page or console").toEqual([]);
			// An expected error that never happened is a stale pattern (or the test stopped provoking it).
			const unseen = expectedErrors.filter(
				(pattern) => !errors.some((error) => pattern.test(error)),
			);
			expect(unseen, "expected errors that didn't happen").toEqual([]);
		},
		// `auto`: runs for every test, even though no test asks for `failOnPageErrors` by name.
		{ auto: true },
	],
});

export { expect };
