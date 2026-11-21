import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Auth } from "./auth.ts";

// Who is signed in, as Better Auth returns it: the user, and this device's session row.
export type AuthSession = Auth["$Infer"]["Session"];

declare module "fastify" {
	interface FastifyRequest {
		// Set by requireSession; null on routes without it. Read it with sessionOf().
		authSession: AuthSession | null;
	}
}

// Authentication for our own routes: an `onRequest` hook. Add it to a plugin, and every route in that plugin
// (and only there: Fastify scopes hooks to their plugin) answers 401 unless the request carries a valid
// session, from the cookie (browsers) or, later, an Authorization header (10.5). It only says *who* is asking;
// each route still decides what that user may touch (authorization), by filtering on their id.
export async function requireSession(
	request: FastifyRequest,
	reply: FastifyReply,
): Promise<void> {
	const session = await request.server.auth.api.getSession({
		headers: fromNodeHeaders(request.headers),
	});
	if (!session) {
		// 401: "we don't know who you are": sign in and try again. (403 would mean "we know, and the answer is no".)
		reply.code(401);
		return reply.send({ error: "unauthorized" });
	}
	request.authSession = session;
}

// The session in a route behind requireSession. Throws (a 500) if the hook is missing: a route that forgot it
// fails loudly instead of running for everyone.
export function sessionOf(request: FastifyRequest): AuthSession {
	if (!request.authSession) {
		throw new Error(`${request.url}: route needs the requireSession hook`);
	}
	return request.authSession;
}
