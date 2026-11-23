import { z } from "zod";

// The send_email job's payload. Plain .ts (no JSX): the server imports it, and `pnpm dev` runs it on Node,
// which can't load .tsx. Add an email: a member here, a template in templates/, a case in render.tsx.
export const emailMessage = z.discriminatedUnion("template", [
	z.object({
		template: z.literal("welcome"),
		to: z.email(),
		props: z.object({ name: z.string().min(1).max(100) }),
	}),
	z.object({
		template: z.literal("sign-in-code"),
		to: z.email(),
		props: z.object({
			code: z.string().regex(/^\d{6}$/),
			expiresInMinutes: z.number().int().positive(),
		}),
	}),
]);

export type EmailMessage = z.output<typeof emailMessage>;
