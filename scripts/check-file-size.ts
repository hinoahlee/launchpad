// `pnpm lint` runs this: fails when a source file outgrows its limit. Small files keep each read cheap for
// people and agents. Over the limit: split by responsibility (see CLAUDE.md, "Where code goes").
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MAX_LINES = 250;
const MAX_TEST_LINES = 600;

// Generated code, or code owned by a tool.
const IGNORED = [
	/^apps\/web\/src\/components\/ui\//,
	/^apps\/web\/src\/routeTree\.gen\.ts$/,
	/^packages\/db\/migrations\//,
];

const files = execFileSync(
	"git",
	["ls-files", "--cached", "--others", "--exclude-standard"],
	{ encoding: "utf8" },
)
	.split("\n")
	.filter((file) => /^(apps|packages|e2e|scripts)\/.*\.(ts|tsx|js)$/.test(file))
	.filter((file) => !IGNORED.some((pattern) => pattern.test(file)));

const tooLong = files.flatMap((file) => {
	let text: string;
	try {
		text = readFileSync(file, "utf8");
	} catch {
		return []; // deleted but not yet staged
	}
	const lines = text.split("\n").length;
	const max = /\.(test|spec)\.tsx?$/.test(file) ? MAX_TEST_LINES : MAX_LINES;
	return lines > max ? [`${file}: ${lines} lines (max ${max})`] : [];
});

if (tooLong.length > 0) {
	console.error(`Files over the size limit:\n  ${tooLong.join("\n  ")}`);
	process.exitCode = 1;
} else {
	console.log(`file sizes ok (${files.length} files)`);
}
