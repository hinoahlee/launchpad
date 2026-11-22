import { z } from "zod";

// Org-scoped routes live under /api/organizations/:organizationId/... (step 12.2). The id is explicit in every
// URL, not taken from the session, so a link, a mobile client or a background job names the organization it
// means. The web app reads it from the session (`session.activeOrganizationId`).
export const organizationParamsSchema = z.object({ organizationId: z.uuid() });

export type OrganizationParams = z.infer<typeof organizationParamsSchema>;
