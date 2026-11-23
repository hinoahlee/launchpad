// `pnpm lint` runs this: imports must respect module boundaries, so a file's imports say where things live.
// A module is one feature (`src/features/<name>`), one lib (`src/lib/<name>`, or a single `src/lib/<file>.ts`), one
// other folder under `src/` (http, config, testing, routes, components/<name>), the files directly in `src/`, or a
// whole package under `packages/`.
// - Inside a module: relative paths (`./x.ts`, `../types.ts`).
// - Across modules: the `#` alias (`#lib/jobs/enqueue.ts`).
// - Features are imported only by apps/api/src/app.ts and apps/web/src/routes/.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const posix = path.posix;

const files = execFileSync(
	"git",
	["ls-files", "--cached", "--others", "--exclude-standard"],
	{ encoding: "utf8" },
)
	.split("\n")
	.filter((file) => /^(apps|packages|e2e)\/.*\.(ts|tsx)$/.test(file))
	.filter(
		(file) =>
			!file.includes("/components/ui/") && !file.endsWith("routeTree.gen.ts"),
	);

function aliasRoot(file: string): string | undefined {
	const app = /^apps\/[^/]+\/src/.exec(file);
	if (app) return app[0];
	if (file.startsWith("e2e/")) return "e2e";
	return undefined;
}

export function moduleOf(file: string): string {
	const pkg = /^packages\/[^/]+/.exec(file);
	if (pkg) return pkg[0];
	const nested =
		/^(apps\/[^/]+\/src\/(?:features|lib|components)\/[^/]+)(\/|$)/.exec(file);
	if (nested?.[1]) return nested[1];
	const dir = /^(apps\/[^/]+\/src\/[^/]+)\//.exec(file);
	if (dir?.[1]) return dir[1];
	const e2eDir = /^(e2e\/[^/]+)\//.exec(file);
	if (e2eDir?.[1]) return e2eDir[1];
	return posix.dirname(file);
}

const isFeature = (module: string) => /\/src\/features\/[^/]+$/.test(module);
const mayImportFeatures = (file: string) =>
	file === "apps/api/src/app.ts" || file.startsWith("apps/web/src/routes/");

const IMPORT = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
const problems: string[] = [];

for (const file of files) {
	const text = readFileSync(file, "utf8");
	const own = moduleOf(file);
	for (const [, spec = ""] of text.matchAll(IMPORT)) {
		const relative = spec.startsWith("./") || spec.startsWith("../");
		const root = aliasRoot(file);
		let target: string;
		if (relative)
			target = posix.normalize(posix.join(posix.dirname(file), spec));
		else if (spec.startsWith("#") && root)
			target = posix.join(root, spec.slice(1));
		else continue;
		const targetModule = moduleOf(target);
		const where = `${file}: "${spec}"`;
		if (
			isFeature(targetModule) &&
			targetModule !== own &&
			!mayImportFeatures(file)
		) {
			problems.push(
				`${where} imports another feature: move shared code to lib/`,
			);
		} else if (relative && targetModule !== own) {
			problems.push(
				`${where} leaves its module: use #${posix.relative(root ?? "", target)}`,
			);
		} else if (!relative && targetModule === own) {
			problems.push(`${where} is in the same module: use a relative path`);
		}
	}
}

if (problems.length > 0) {
	console.error(`Import boundary problems:\n  ${problems.join("\n  ")}`);
	process.exitCode = 1;
} else {
	console.log(`imports ok (${files.length} files)`);
}
