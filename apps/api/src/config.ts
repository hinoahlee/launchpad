import { z } from "zod";

// Every environment variable the API reads, parsed once at boot. Nothing else reads process.env.
const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "test", "production"])
		.default("development"),
	PORT: z.coerce.number().int().min(1).max(65535).default(3000),
	LOG_LEVEL: z
		.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
		.default("info"),
	// The commit the image was built from. CI bakes it in (Dockerfile `ARG GIT_SHA`); `/api/version` reports
	// it so a deploy can check the new code is live. Unset in dev.
	GIT_SHA: z.string().default("dev"),
});

export type Config = z.infer<typeof envSchema>;

// Fail fast: a bad value stops the process at boot with a readable message, not on the first request.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
	const result = envSchema.safeParse(env);
	if (!result.success) {
		console.error(
			`Invalid environment variables:\n${z.prettifyError(result.error)}`,
		);
		process.exit(1);
	}
	return result.data;
}
