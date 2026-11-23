import { z } from "zod";
import { emailMessage } from "#lib/email/schemas.ts";

// Every job type and its payload schema. Adding one here makes the compiler require a handler in handlers.ts.
// Payloads are stored as JSON: plain data, and small (ids, not records), so handlers read current data.
export const jobTypes = {
	echo: z.object({ message: z.string().min(1).max(200) }),
	send_email: emailMessage,
	"prune-jobs": z.object({
		olderThanDays: z.number().int().positive().default(7),
	}),
	// Queued in the transaction that deletes the organization (with its owner's account).
	"delete-organization-files": z.object({ organizationId: z.uuid() }),
	// Queued by DELETE /files/:id to run again once every upload URL for the file has expired. Only a file's key
	// shape is accepted, so a payload can never name a whole prefix.
	"delete-file-object": z.object({
		key: z
			.string()
			.regex(
				/^organizations\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/,
				"a file key: organizations/<uuid>/<uuid>",
			),
	}),
	// Registered uploads never completed: their objects and rows (which also frees quota).
	"prune-uploads": z.object({
		olderThanHours: z.number().int().positive().default(24),
	}),
} satisfies Record<string, z.ZodType>;

export type JobType = keyof typeof jobTypes;

// What `enqueue` takes (before defaults) and what the handler receives (after parsing).
export type JobInput<T extends JobType> = z.input<(typeof jobTypes)[T]>;
export type JobPayload<T extends JobType> = z.output<(typeof jobTypes)[T]>;
