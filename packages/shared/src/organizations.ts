import { z } from "zod";

// Better Auth's organization plugin (/api/auth/organization/*), as far as the web app reads it. Like auth.ts, only
// the fields we use; a test in the API checks Better Auth's answers still match.

export const ROLES = ["owner", "admin", "member"] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

// What a person may call an organization. The API checks it too, before Better Auth saves a name.
export const organizationNameSchema = z.string().trim().min(1).max(64);

export const organizationSchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
});

export type Organization = z.infer<typeof organizationSchema>;

// GET /api/auth/organization/list: every organization the signed-in user belongs to.
export const organizationListResponseSchema = z.array(organizationSchema);

// POST /api/auth/organization/create: the signed-in user becomes its owner, and it becomes this session's active
// organization. 400 ORGANIZATION_ALREADY_EXISTS if the slug is taken.
export const createOrganizationRequestSchema = z.object({
	name: organizationNameSchema,
	slug: z.string(),
});

export type CreateOrganizationRequest = z.infer<
	typeof createOrganizationRequestSchema
>;

// POST /api/auth/organization/set-active: switch this session to another organization. 403
// USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION if it isn't one of yours.
export const setActiveOrganizationRequestSchema = z.object({
	organizationId: z.string(),
});

export type SetActiveOrganizationRequest = z.infer<
	typeof setActiveOrganizationRequestSchema
>;

// GET /api/auth/organization/get-active-member: your membership in the active organization (your role there).
export const activeMemberResponseSchema = z.object({
	organizationId: z.string(),
	role: roleSchema,
});

export type ActiveMember = z.infer<typeof activeMemberResponseSchema>;
