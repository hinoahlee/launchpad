import { members, type Role } from "@launchpad/db";
import { organizationParamsSchema } from "@launchpad/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { sessionOf } from "./require-session.ts";

// Each role can do everything the roles below it can.
const RANK: Record<Role, number> = { member: 1, admin: 2, owner: 3 };

export const atLeast = (role: Role, minRole: Role) =>
	RANK[role] >= RANK[minRole];

export type Membership = { organizationId: string; role: Role };

declare module "fastify" {
	interface FastifyRequest {
		// Set by requireMembership; null on routes without it. Read it with membershipOf().
		membership: Membership | null;
	}
}

// Authorization for org-scoped routes (/api/organizations/:organizationId/...): a `preHandler` hook, after
// requireSession (who is asking) and after the route's params are validated. It answers:
// - 404 if the signed-in user isn't a member of that organization: to them it doesn't exist, the same answer as
//   a made-up id, so ids can't be probed;
// - 403 if they are, but their role is below `minRole`: "we know you, and the answer is no".
// Then every query in the route filters on membershipOf(request).organizationId (decision 011).
export function requireMembership(minRole: Role) {
	return async (request: FastifyRequest, reply: FastifyReply) => {
		const { user } = sessionOf(request);
		// The route's params schema must include organizationId; without it, fail loudly (a 500), never open.
		const { organizationId } = organizationParamsSchema.parse(request.params);
		const [membership] = await request.server.db
			.select({ organizationId: members.organizationId, role: members.role })
			.from(members)
			.where(
				and(
					eq(members.organizationId, organizationId),
					eq(members.userId, user.id),
				),
			);
		if (!membership) {
			reply.code(404);
			return reply.send({ error: "not_found" });
		}
		if (!atLeast(membership.role, minRole)) {
			reply.code(403);
			return reply.send({ error: "forbidden" });
		}
		request.membership = membership;
	};
}

// The membership in a route behind requireMembership. Throws (a 500) if the hook is missing.
export function membershipOf(request: FastifyRequest): Membership {
	if (!request.membership) {
		throw new Error(`${request.url}: route needs the requireMembership hook`);
	}
	return request.membership;
}
