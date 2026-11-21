import type { Config } from "#config.ts";

// Port 1 on this machine: nothing listens there, so every connection is refused at once. For tests that
// don't need the database; the ones that do pass `testDatabaseUrl()`.
export const UNREACHABLE_DB = "postgres://test:test@127.0.0.1:1/test";

// A full, valid config for buildApp in tests. Override only what the test is about.
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
