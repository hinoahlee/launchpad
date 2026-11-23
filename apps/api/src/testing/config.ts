import type { Config } from "#config/schema.ts";

// Nothing listens on port 1: connections are refused at once. Tests that need a database pass testDatabaseUrl().
export const UNREACHABLE_DB = "postgres://test:test@127.0.0.1:1/test";

export function testConfig(overrides: Partial<Config> = {}): Config {
	return {
		NODE_ENV: "test",
		PORT: 0,
		LOG_LEVEL: "silent",
		GIT_SHA: "abc123",
		DEBUG_ERROR_ROUTE: false,
		DATABASE_URL: UNREACHABLE_DB,
		TRUST_PROXY_HOPS: 0,
		S3_REGION: "auto",
		...overrides,
	};
}
