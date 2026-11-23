import { z } from "zod";
import { type Config, envSchema } from "./schema.ts";

const together = (...values: unknown[]) =>
	values.every((v) => !v) || values.every(Boolean);

// Exits on invalid config, so a bad value stops the boot instead of failing on the first request.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
	const result = envSchema
		.refine((c) => together(c.RESEND_API_KEY, c.EMAIL_FROM), {
			message: "set RESEND_API_KEY and EMAIL_FROM together, or neither",
			path: ["EMAIL_FROM"],
		})
		.refine((c) => together(c.GOOGLE_CLIENT_ID, c.GOOGLE_CLIENT_SECRET), {
			message:
				"set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET together, or neither",
			path: ["GOOGLE_CLIENT_SECRET"],
		})
		.refine((c) => together(c.S3_ACCESS_KEY_ID, c.S3_SECRET_ACCESS_KEY), {
			message:
				"set S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY together, or neither (AWS: the instance's role)",
			path: ["S3_SECRET_ACCESS_KEY"],
		})
		.refine((c) => c.S3_BUCKET || !c.S3_ACCESS_KEY_ID, {
			message: "S3_ACCESS_KEY_ID is set but S3_BUCKET isn't",
			path: ["S3_BUCKET"],
		})
		// Without an endpoint the SDK talks to AWS S3, which has no "auto" region.
		.refine((c) => !c.S3_BUCKET || c.S3_ENDPOINT || c.S3_REGION !== "auto", {
			message: "AWS S3 (no S3_ENDPOINT) needs S3_REGION, e.g. us-east-1",
			path: ["S3_REGION"],
		})
		.refine((c) => together(c.STRIPE_API_KEY, c.STRIPE_PRICE_ID), {
			message: "set STRIPE_API_KEY and STRIPE_PRICE_ID together, or neither",
			path: ["STRIPE_PRICE_ID"],
		})
		.refine((c) => !c.STRIPE_WEBHOOK_SECRET || c.STRIPE_API_KEY, {
			message: "STRIPE_WEBHOOK_SECRET needs STRIPE_API_KEY and STRIPE_PRICE_ID",
			path: ["STRIPE_WEBHOOK_SECRET"],
		})
		.safeParse(env);
	if (!result.success) {
		console.error(
			`Invalid environment variables:\n${z.prettifyError(result.error)}`,
		);
		process.exit(1);
	}
	return result.data;
}
