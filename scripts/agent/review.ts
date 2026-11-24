// Parsing the reviewer's findings: one line each, `CONFIRMED | PLAUSIBLE | STYLE  file:line  what  evidence`.
export const FINDING =
	/^\s*[-*]?\s*(CONFIRMED|PLAUSIBLE|STYLE)\b\s*[|:]?\s*(\S+:\d+)\s+(.+)$/;
export const NO_FINDINGS = "NO FINDINGS";

export type Finding = {
	kind: "CONFIRMED" | "PLAUSIBLE" | "STYLE";
	location: string;
	text: string;
};
export type ParsedReview = { status: "ok" | "malformed"; findings: Finding[] };

export function parseReview(output: string): ParsedReview {
	const findings: Finding[] = [];
	let sawNone = false;
	for (const line of output.split(/\r?\n/)) {
		if (line.trim().toUpperCase() === NO_FINDINGS) sawNone = true;
		const match = FINDING.exec(line);
		if (match) {
			findings.push({
				kind: match[1] as Finding["kind"],
				location: match[2] ?? "",
				text: (match[3] ?? "").trim(),
			});
		}
	}
	// No parseable line and no explicit "none" means the reviewer didn't finish (or ignored the format): not a pass.
	return {
		status: findings.length > 0 || sawNone ? "ok" : "malformed",
		findings,
	};
}
