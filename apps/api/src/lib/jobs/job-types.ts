import { z } from "zod";
import { emailMessage } from "#lib/email/messages.ts";

// Every kind of background job, by name, with the Zod schema its payload must match. Add a job type here; the
// compiler then checks every `enqueue()` call against its schema, and requires a handler in handlers.ts.
// Payloads are stored as JSON: plain data only (no Dates, class instances or functions), and keep them small
// (ids, not whole records), so the handler reads current data when it runs.
export const jobTypes = {
	// A sample job: proves the queue end to end. Real types (send an email, ...) arrive with their features.
	echo: z.object({ message: z.string().min(1).max(200) }),
	// Renders an email template and sends it (lib/email). Queued in the request; failed sends retry.
	send_email: emailMessage,
	// Deletes finished jobs, so the table doesn't grow forever. Queued every hour by schedules.ts. `{}` is a valid
	// input: the default fills in olderThanDays.
	"prune-jobs": z.object({
		olderThanDays: z.number().int().positive().default(7),
	}),
	// Deletes every object a deleted organization left in the bucket (organizations/<id>/). Queued in the same
	// transaction that deletes it (with its owner's account, features/auth); its file rows went with it.
	"delete-organization-files": z.object({ organizationId: z.uuid() }),
	// Deletes what a deleted account uploaded before 12.2, under the old prefix (users/<userId>/). Queued by account
	// deletion (features/auth/auth.ts); its database rows are already gone (ON DELETE CASCADE).
	"delete-user-files": z.object({ userId: z.uuid() }),
	// Deletes one file's object again, once every upload URL for it has expired (security review L2): a PUT through a
	// URL signed before the file was deleted would bring the object back with no row. Queued by DELETE /files/:id.
	// Only a file's key shape (organizations/<uuid>/<uuid>), so a payload can never name a whole prefix.
	"delete-file-object": z.object({
		key: z
			.string()
			.regex(
				/^organizations\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/,
				"a file key: organizations/<uuid>/<uuid>",
			),
	}),
	// Deletes abandoned uploads: registered, never completed, older than olderThanHours. Their objects (if the
	// PUT happened) and their rows, which also gives the space back to the user's quota. Queued every hour.
	"prune-uploads": z.object({
		olderThanHours: z.number().int().positive().default(24),
	}),
} satisfies Record<string, z.ZodType>;

export type JobType = keyof typeof jobTypes;

// What the caller passes (before defaults/transforms) and what the handler receives (after parsing).
export type JobInput<T extends JobType> = z.input<(typeof jobTypes)[T]>;
export type JobPayload<T extends JobType> = z.output<(typeof jobTypes)[T]>;
