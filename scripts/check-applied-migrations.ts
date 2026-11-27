// `pnpm lint` runs this: a migration already on main may have run against a database, so it never changes.
// Compares the branch (committed and uncommitted) with origin/main.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
	editedMigrations,
	isMigration,
	outOfOrderMigrations,
	PROJECT_MIGRATIONS,
} from "./migrations.ts";

const git = (args: string[]) =>
	execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

// Needs no origin/main, so it runs in a shallow CI checkout too.
const outOfOrder = outOfOrderMigrations(
	readFileSync(PROJECT_MIGRATIONS.journal, "utf8"),
);
if (outOfOrder.length > 0) {
	console.error(
		`Migrations older than the one before them (a database that ran the newer one would skip them):\n  ${outOfOrder.join("\n  ")}\nDelete each one's SQL, snapshot and journal entry, then run \`pnpm db:generate\` again on top of main.`,
	);
	process.exit(1);
}

let base: string;
try {
	base = git(["merge-base", "origin/main", "HEAD"]).trim();
} catch {
	// A shallow CI checkout has no origin/main to compare against.
	console.log(
		"applied migrations: skipped (no origin/main to compare against)",
	);
	process.exit(0);
}

const changes = git(["diff", "--no-renames", "--name-status", base])
	.split("\n")
	.filter(Boolean)
	.map((line) => {
		const [status = "", path = ""] = line.split("\t");
		return { path, status: status[0] as "A" | "M" | "D" };
	})
	.filter((change) => isMigration(change.path))
	.map((change) => ({
		...change,
		before:
			change.status === "A"
				? undefined
				: git(["show", `${base}:${change.path}`]),
		after: existsSync(change.path)
			? readFileSync(change.path, "utf8")
			: undefined,
	}));

const edited = editedMigrations(changes);
if (edited.length > 0) {
	console.error(
		`Migrations already on main were changed:\n  ${edited.join("\n  ")}\nRestore each with \`git checkout origin/main -- <file>\` and put the change in a new migration.`,
	);
	process.exitCode = 1;
} else {
	console.log(
		`applied migrations ok (${changes.length} migration files changed)`,
	);
}
