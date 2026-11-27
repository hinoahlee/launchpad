import { DrizzleQueryError } from "drizzle-orm/errors";
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

	it("logs a failed query without its parameters or the Postgres detail", () => {
		const cause = Object.assign(new Error("duplicate key"), {
			code: "23505",
			detail: "Key (email)=(a@b.co) already exists.",
		});
		const err = new DrizzleQueryError(
			"insert into users (email) values ($1)",
			["a@b.co"],
			cause,
		);
		for (const key of ["err", "error"]) {
			const line = logLine({ [key]: err });
			expect(line[key].message).toBe(
				"Failed query: insert into users (email) values ($1)",
			);
			expect(line[key].code).toBe("23505");
			expect(JSON.stringify(line)).not.toContain("a@b.co");
		}
	});

	it("logs other errors as usual", () => {
		const line = logLine({ err: new Error("boom") });
		expect(line.err).toMatchObject({ type: "Error", message: "boom" });
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
