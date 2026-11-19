import { z } from "zod";

// Every 4xx/5xx body: a stable snake_case code to branch on, and the request ID to quote in a bug report.
// The API adds `requestId` to every error after the handler returns, so handlers (and their response schemas)
// return just `{ error }`; optional here for that reason.
export const errorResponseSchema = z.object({
	error: z.string(),
	requestId: z.string().optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

// 400 when a request doesn't match its schema. `path` points at the bad field ("/name"), `message` says why.
export const validationErrorResponseSchema = errorResponseSchema.extend({
	error: z.literal("validation_failed"),
	details: z.array(z.object({ path: z.string(), message: z.string() })),
});

export type ValidationErrorResponse = z.infer<
	typeof validationErrorResponseSchema
>;
