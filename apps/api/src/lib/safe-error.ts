import { DrizzleQueryError } from "drizzle-orm/errors";

// A failed query's message ends with its parameters (emails, sign-in codes, file names), and the Postgres error it
// wraps can quote them in `detail`. Logs and Sentry get the query text (placeholders only) and the Postgres error
// code (and constraint name) instead. Other errors pass through unchanged.
export function safeError(err: unknown): unknown {
	if (!(err instanceof DrizzleQueryError)) return err;
	const cause = err.cause as
		| { code?: unknown; constraint_name?: unknown }
		| undefined;
	const safe = Object.assign(new Error(`Failed query: ${err.query}`), {
		code: cause?.code,
		constraint: cause?.constraint_name,
	});
	safe.name = "DrizzleQueryError";
	// The stack's first line repeats the message, parameters included.
	safe.stack = `${safe.name}: ${safe.message}\n${(err.stack ?? "")
		.split("\n")
		.filter((line) => line.startsWith("    at "))
		.join("\n")}`;
	return safe;
}
