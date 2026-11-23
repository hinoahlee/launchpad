import type { FastifyReply, FastifyRequest } from "fastify";

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Better Auth checks its own; webhooks prove who they are with a signature.
const EXEMPT = /^\/api\/(auth|webhooks)\//;

// CSRF: browsers always send `Origin` on unsafe methods and scripts can't change it. Another origin → 403, even
// a subdomain (SameSite=Lax would send it the cookie). No `Origin` means not a browser (bearer clients): allowed.
export function requireSameOrigin(appUrl: string) {
	const allowed = new URL(appUrl).origin;
	return async (request: FastifyRequest, reply: FastifyReply) => {
		if (!UNSAFE.has(request.method) || EXEMPT.test(request.url)) return;
		const origin = request.headers.origin;
		if (origin === undefined || origin === allowed) return;
		request.log.warn({ origin }, "request from another origin refused");
		reply.code(403);
		return reply.send({ error: "forbidden_origin" });
	};
}
