import { describe, expect, it } from "vitest";
import { assertDisposable } from "./database.ts";

const at = (name: string) => `postgres://u:p@localhost:5433/${name}`;

describe("assertDisposable", () => {
	it("allows Vitest's and Playwright's databases", () => {
		expect(assertDisposable(at("launchpad_test"))).toBe(at("launchpad_test"));
		expect(assertDisposable(at("launchpad_e2e"))).toBe(at("launchpad_e2e"));
	});

	// The dev database, or production through a stray URL: never wiped by test helpers.
	it("refuses any other database", () => {
		for (const name of ["launchpad", "launchpad_prod", "test_launchpad"]) {
			expect(() => assertDisposable(at(name))).toThrow(
				"must end in _test or _e2e",
			);
		}
	});
});
