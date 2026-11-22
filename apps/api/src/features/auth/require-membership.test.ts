import { ROLES } from "@launchpad/db";
import { describe, expect, it } from "vitest";
import { atLeast } from "./require-membership.ts";

describe("atLeast", () => {
	it("ranks owner > admin > member", () => {
		const allowed = ROLES.flatMap((role) =>
			ROLES.filter((min) => atLeast(role, min)).map((min) => `${role}≥${min}`),
		);
		expect(allowed.sort()).toEqual(
			[
				"owner≥owner",
				"owner≥admin",
				"owner≥member",
				"admin≥admin",
				"admin≥member",
				"member≥member",
			].sort(),
		);
	});
});
