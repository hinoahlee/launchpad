import { z } from "zod";

// Org-scoped routes: /api/organizations/:organizationId/... The id is explicit in every URL, never taken from
// the session, so links, mobile clients and jobs name the organization they mean.
export const organizationParamsSchema = z.object({ organizationId: z.uuid() });

export type OrganizationParams = z.infer<typeof organizationParamsSchema>;
