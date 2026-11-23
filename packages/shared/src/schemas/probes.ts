import { z } from "zod";

// GET /api/health and GET /api/ready (200).
export const healthResponseSchema = z.object({ status: z.literal("ok") });

export type HealthResponse = z.infer<typeof healthResponseSchema>;

// GET /api/version
export const versionResponseSchema = z.object({ sha: z.string() });

export type VersionResponse = z.infer<typeof versionResponseSchema>;
