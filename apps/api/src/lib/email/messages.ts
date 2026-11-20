import { z } from "zod";

// Every email the app sends: which template, to whom, and the template's props. This is the `send_email` job's
// payload, so enqueue() checks it in the request that queues the email. Plain .ts, no JSX: routes import it,
// and `pnpm dev` runs the server with Node, which can't load .tsx. Templates render in the worker (render.tsx).
//
// Add an email: a member here, its template in templates/, and its case in render.tsx (the compiler asks).
// Props are plain data (strings, numbers), escaped by React when rendered.
export const emailMessage = z.discriminatedUnion("template", [
	z.object({
		template: z.literal("welcome"),
		to: z.email(),
		props: z.object({ name: z.string().min(1).max(100) }),
	}),
]);

export type EmailMessage = z.output<typeof emailMessage>;
