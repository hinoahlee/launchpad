import { test as base, expect } from "@playwright/test";
import { clientIp } from "./sign-in.ts";

// Import `test` and `expect` from here, never from @playwright/test: any browser console error fails the test,
// even when every assertion passed. A test that provokes one on purpose declares it:
// `test.use({ expectedErrors: [/delete-user/] })`; an expected error that never happens fails too.
export const test = base.extend<{
	expectedErrors: RegExp[];
	failOnPageErrors: undefined;
	ownClientIp: undefined;
}>({
	expectedErrors: [[], { option: true }],
	// Each test is its own client IP, for the per-IP sign-in limits. Only on our origin: the bucket's CORS
	// wouldn't allow the header.
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
		{ auto: true },
	],
});

export { expect };
