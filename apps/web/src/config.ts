import { z } from "zod";

// Baked into the bundle at build time, so public: never a secret.
const envSchema = z.object({
	MODE: z.string(),
	VITE_GIT_SHA: z.string().min(1).default("dev"),
	VITE_SENTRY_DSN: z
		.url()
		.optional()
		.or(z.literal("").transform(() => undefined)),
});

export type Config = z.infer<typeof envSchema>;

export const config: Config = envSchema.parse(import.meta.env);
