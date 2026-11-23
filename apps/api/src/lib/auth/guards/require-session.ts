import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Auth } from "../create.ts";

export type AuthSession = Auth["$Infer"]["Session"];

declare module "fastify" {
	interface FastifyRequest {
		authSession: AuthSession | null;
	}
}

// onRequest hook: 401 unless the request carries a valid session (cookie, or `Authorization: Bearer`).
// Authentication only: each route still filters its queries on the user's id.
export async function requireSession(
	request: FastifyRequest,
	reply: FastifyReply,
): Promise<void> {
	const session = await request.server.auth.api.getSession({
		headers: fromNodeHeaders(request.headers),
	});
	if (!session) {
		reply.code(401);
		return reply.send({ error: "unauthorized" });
	}
	request.authSession = session;
}

// Throws (500) if the route forgot requireSession: fails closed.
export function sessionOf(request: FastifyRequest): AuthSession {
	if (!request.authSession) {
		throw new Error(`${request.url}: route needs the requireSession hook`);
	}
	return request.authSession;
}
