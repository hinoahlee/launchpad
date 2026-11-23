import { describe, expect, it } from "vitest";
import { createLogger } from "#lib/logger.ts";

describe("logger", () => {
	function logLine(fields: Record<string, unknown>) {
		const lines: string[] = [];
		createLogger("info", { write: (line) => lines.push(line) }).info(
			fields,
			"test",
		);
		return JSON.parse(lines[0] ?? "{}");
	}

	it("redacts secrets at the top level and one level down", () => {
		const line = logLine({
			password: "hunter2",
			token: "t0k3n",
			body: { password: "hunter2", email: "a@b.co" },
			headers: { authorization: "Bearer abc", cookie: "sid=1", accept: "*/*" },
		});
		expect(line).toMatchObject({
			password: "[redacted]",
			token: "[redacted]",
			body: { password: "[redacted]", email: "a@b.co" },
			headers: {
				authorization: "[redacted]",
				cookie: "[redacted]",
				accept: "*/*",
			},
		});
		expect(JSON.stringify(line)).not.toMatch(/hunter2|t0k3n|Bearer|sid=1/);
	});

	it("redacts headers nested in a request object", () => {
		const line = logLine({
			req: { headers: { authorization: "Bearer abc", "set-cookie": "x" } },
		});
		expect(line.req.headers).toEqual({
			authorization: "[redacted]",
			"set-cookie": "[redacted]",
		});
	});
});
