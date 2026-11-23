import { members, type Role } from "@launchpad/db";
import { organizationParamsSchema } from "@launchpad/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { sessionOf } from "./require-session.ts";

const RANK: Record<Role, number> = { member: 1, admin: 2, owner: 3 };

export const atLeast = (role: Role, minRole: Role) =>
	RANK[role] >= RANK[minRole];

export type Membership = { organizationId: string; role: Role };

declare module "fastify" {
	interface FastifyRequest {
		membership: Membership | null;
	}
}

// preHandler for /api/organizations/:organizationId/... routes, after requireSession.
// Not a member → 404 (the same as a made-up id, so ids can't be probed). Role below `minRole` → 403.
// The route must then filter every query on membershipOf(request).organizationId.
export function requireMembership(minRole: Role) {
	return async (request: FastifyRequest, reply: FastifyReply) => {
		const { user } = sessionOf(request);
		// Throws (500) if the route has no :organizationId: fails closed.
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

// Throws (500) if the route forgot requireMembership: fails closed.
export function membershipOf(request: FastifyRequest): Membership {
	if (!request.membership) {
		throw new Error(`${request.url}: route needs the requireMembership hook`);
	}
	return request.membership;
}
