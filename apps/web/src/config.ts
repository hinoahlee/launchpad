import { z } from "zod";

// Build-time settings. Vite copies VITE_* variables into the bundle when it builds (CI sets them as Docker build
// args), so they're public: anyone can read them in the browser. Never put a secret here.
const envSchema = z.object({
	// Vite's mode: "development" under `pnpm dev`, "production" in a build.
	MODE: z.string(),
	// The commit the bundle was built from. Unset in dev.
	VITE_GIT_SHA: z.string().min(1).default("dev"),
	// Sentry project launchpad-web → Client Keys. Unset or empty: Sentry is off.
	VITE_SENTRY_DSN: z
		.url()
		.optional()
		.or(z.literal("").transform(() => undefined)),
});

export type Config = z.infer<typeof envSchema>;

// Parsed once, when the app loads: a bad value fails at startup, not when the first error is reported.
export const config: Config = envSchema.parse(import.meta.env);
