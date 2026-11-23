import { z } from "zod";

// GET /api/greeting?name=Ada: the smallest example of the contract pattern.
export const greetingQuerySchema = z.object({
	name: z.string().trim().min(1).max(50),
});

export type GreetingQuery = z.infer<typeof greetingQuerySchema>;

export const greetingResponseSchema = z.object({ message: z.string() });

export type GreetingResponse = z.infer<typeof greetingResponseSchema>;
