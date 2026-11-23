import { signInMethodsResponseSchema } from "@launchpad/shared";
import { describe, expect, it } from "vitest";
import { buildApp } from "#app.ts";
import { testConfig } from "#testing/config.ts";

async function methods(config: Parameters<typeof testConfig>[0]) {
	const app = buildApp(testConfig(config));
	try {
		const res = await app.inject({
			method: "GET",
			url: "/api/sign-in-methods",
		});
		expect(res.statusCode).toBe(200);
		return signInMethodsResponseSchema.parse(res.json());
	} finally {
		await app.close();
	}
}

describe("GET /api/sign-in-methods", () => {
	it("Google off without its settings", async () => {
		expect(await methods({})).toEqual({ google: false });
	});

	it("Google on when configured", async () => {
		expect(
			await methods({
				GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com",
				GOOGLE_CLIENT_SECRET: "secret",
			}),
		).toEqual({ google: true });
	});
});
