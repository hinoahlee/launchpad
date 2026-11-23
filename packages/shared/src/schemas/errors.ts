import { z } from "zod";

// Every 4xx/5xx body. Handlers return `{ error }`; the API adds `requestId` afterwards, hence optional.
export const errorResponseSchema = z.object({
	error: z.string(),
	requestId: z.string().optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

// 400 when a request doesn't match its route's schema.
export const validationErrorResponseSchema = errorResponseSchema.extend({
	error: z.literal("validation_failed"),
	details: z.array(z.object({ path: z.string(), message: z.string() })),
});

export type ValidationErrorResponse = z.infer<
	typeof validationErrorResponseSchema
>;
