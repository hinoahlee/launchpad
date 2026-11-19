import { z } from "zod";

// Every kind of background job, by name, with the Zod schema its payload must match. Add a job type here; the
// compiler then checks every `enqueue()` call against its schema. The worker's handler for each type comes in 8.2.
// Payloads are stored as JSON: plain data only (no Dates, class instances or functions), and keep them small
// (ids, not whole records), so the handler reads current data when it runs.
export const jobTypes = {
	// A sample job: proves the queue end to end. Real types (send an email, ...) arrive with their features.
	echo: z.object({ message: z.string().min(1).max(200) }),
} satisfies Record<string, z.ZodType>;

export type JobType = keyof typeof jobTypes;

// What the caller passes (before defaults/transforms) and what the handler receives (after parsing).
export type JobInput<T extends JobType> = z.input<(typeof jobTypes)[T]>;
export type JobPayload<T extends JobType> = z.output<(typeof jobTypes)[T]>;
