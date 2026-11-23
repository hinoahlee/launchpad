import { describe, expect, it } from "vitest";
import { planFor } from "#lib/entitlements.ts";

describe("planFor", () => {
	it("pro while paid, in trial, or retrying a failed renewal", () => {
		for (const status of ["active", "trialing", "past_due"]) {
			expect(planFor(status)).toBe("pro");
		}
	});

	it("free with no subscription, or one that isn't paid", () => {
		for (const status of [
			undefined,
			"incomplete",
			"incomplete_expired",
			"unpaid",
			"paused",
			"canceled",
			"a_status_stripe_adds_later",
		]) {
			expect(planFor(status)).toBe("free");
		}
	});
});
