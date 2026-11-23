// `pnpm db:check`: fails if src/schema/ has changes no committed migration covers, by running drizzle-kit
// generate into a scratch copy of migrations/ and checking nothing new was written.
import { spawnSync } from "node:child_process";
import { cpSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const pkgRoot = path.resolve(import.meta.dirname, "..");
// Relative and inside the package: drizzle-kit mangles absolute Windows paths given to --out.
const scratch = ".migrations-check";
const scratchAbs = path.join(pkgRoot, scratch);

const journalEntries = (dir: string): number =>
	JSON.parse(readFileSync(path.join(dir, "meta/_journal.json"), "utf8")).entries
		.length;

rmSync(scratchAbs, { recursive: true, force: true });
cpSync(path.join(pkgRoot, "migrations"), scratchAbs, { recursive: true });

try {
	const before = journalEntries(scratchAbs);
	// Flags instead of drizzle.config.ts: drizzle-kit refuses --out together with --config.
	const result = spawnSync(
		process.execPath,
		[
			path.join(pkgRoot, "node_modules/drizzle-kit/bin.cjs"),
			"generate",
			"--dialect=postgresql",
			"--schema=./src/schema/index.ts",
			`--out=./${scratch}`,
		],
		{
			cwd: pkgRoot,
			encoding: "utf8",
			// Closed stdin: an interactive question ("was this column renamed?") ends the run instead of
			// hanging CI. A rename needs a human: run `pnpm db:generate` and answer it.
			stdio: ["ignore", "pipe", "pipe"],
			timeout: 60_000,
		},
	);
	const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
	// drizzle-kit exits 0 on some errors, so also require its explicit "no changes" line.
	if (
		result.status === 0 &&
		journalEntries(scratchAbs) === before &&
		output.includes("No schema changes")
	) {
		console.log("migrations match packages/db/src/schema");
	} else {
		console.error(output.trim());
		console.error(
			"\nschema.ts and packages/db/migrations are out of sync. Run `pnpm db:generate`, review the SQL, commit it.",
		);
		process.exitCode = 1;
	}
} finally {
	rmSync(scratchAbs, { recursive: true, force: true });
}
