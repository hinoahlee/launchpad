import { describe, expect, it, vi } from "vitest";
import { directDatabaseUrl, loadConfig } from "./config.ts";

const pooled = "postgres://app:pw@db.internal:6432/app";
const direct = "postgres://app:pw@db.internal:5432/app";

describe("directDatabaseUrl", () => {
	it("is DATABASE_URL when no direct URL is set", () => {
		expect(directDatabaseUrl(loadConfig({ DATABASE_URL: direct }))).toBe(
			direct,
		);
	});

	it("treats an empty DATABASE_DIRECT_URL (as in .env.example) as unset", () => {
		const config = loadConfig({
			DATABASE_URL: direct,
			DATABASE_DIRECT_URL: "",
		});
		expect(directDatabaseUrl(config)).toBe(direct);
	});

	it("is DATABASE_DIRECT_URL when DATABASE_URL goes through a pooler", () => {
		const config = loadConfig({
			DATABASE_URL: pooled,
			DATABASE_DIRECT_URL: direct,
		});
		expect(config.DATABASE_URL).toBe(pooled);
		expect(directDatabaseUrl(config)).toBe(direct);
	});
});

describe("email settings", () => {
	const base = { DATABASE_URL: direct };

	// loadConfig exits the process on a bad value; stub exit so the test sees it as a throw.
	function rejects(env: Record<string, string>): string {
		const exit = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("exit");
		});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			expect(() => loadConfig({ ...base, ...env })).toThrow("exit");
			return String(error.mock.calls[0]?.[0]);
		} finally {
			exit.mockRestore();
			error.mockRestore();
		}
	}

	it("accepts neither (emails are only logged) or both", () => {
		expect(
			loadConfig({ ...base, RESEND_API_KEY: "", EMAIL_FROM: "" }),
		).toMatchObject({
			RESEND_API_KEY: undefined,
			EMAIL_FROM: undefined,
		});
		expect(
			loadConfig({
				...base,
				RESEND_API_KEY: "re_123",
				EMAIL_FROM: "Launchpad <hello@mail.example.com>",
			}),
		).toMatchObject({ EMAIL_FROM: "Launchpad <hello@mail.example.com>" });
	});

	it("stops the boot when only one of the two is set", () => {
		expect(rejects({ RESEND_API_KEY: "re_123" })).toContain(
			"set RESEND_API_KEY and EMAIL_FROM together",
		);
	});

	it("stops the boot on a sender that isn't an address", () => {
		expect(
			rejects({ RESEND_API_KEY: "re_123", EMAIL_FROM: "Launchpad" }),
		).toContain("Name <address> or address");
	});
});
