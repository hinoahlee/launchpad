// The only project-specific file of the agent kit (/kit-init writes it for another repo); every other kit file is
// identical everywhere.

// "Is this safe to merge?": must exit non-zero on a bad change. The Stop hook and `run.ts check` run it.
export const VERIFY_COMMAND = "pnpm verify";

// Browser tests, run during /deliver runs whose changes match E2E_PATHS. Empty: no e2e gate.
export const E2E_COMMAND = "pnpm e2e";

// Changes here can break something only a browser sees: pages, auth, files, the CSP and other HTTP headers.
export const E2E_PATHS = [
	/^apps\/web\//,
	/^apps\/api\/src\/http\//,
	/^apps\/api\/src\/(features|lib)\/(auth|files|storage)\//,
	/^e2e\//,
	/^packages\/shared\/src\/schemas\/(auth|files)/,
];

// Test-only folders besides *.test.* / *.spec.* files: the test writer's side of the boundary.
export const TEST_PATHS = [
	/^e2e\//,
	/^apps\/[^/]+\/src\/testing\//,
	/^packages\/[^/]+\/src\/testing\//,
];

// Applied migrations must never change. Empty: no migration check.
export const MIGRATIONS_DIR = "packages/db/migrations/";
// A file in MIGRATIONS_DIR that may grow by appending entries (drizzle-kit's journal).
export const MIGRATION_JOURNAL = "packages/db/migrations/meta/_journal.json";

// Formats and lints one file after each agent edit (the file path is appended). Empty: no format hook.
export const FORMAT_COMMAND =
	"pnpm exec biome check --write --no-errors-on-unmatched";
