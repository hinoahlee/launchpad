import { describe, expect, it } from "vitest";
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
