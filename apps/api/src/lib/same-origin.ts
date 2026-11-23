import type { FastifyReply, FastifyRequest } from "fastify";

// Methods that change something. GET and HEAD must never do that, so they need no check.
const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Not ours to check: Better Auth checks `Origin` on /api/auth/* itself, and webhooks come from servers (Stripe,
// Resend) that prove who they are with a signature.
const EXEMPT = /^\/api\/(auth|webhooks)\//;

// CSRF defence for our own routes (decision in docs/security-review.md, L1), the same rule Better Auth applies to
// /api/auth/*. A browser sends `Origin` with every POST, PUT, PATCH and DELETE, and page scripts can't change it.
// - Our own page: `Origin` is APP_URL's origin → allowed.
// - Another site, even a subdomain of ours (SameSite=Lax counts those as "same site" and sends the cookie) → 403.
// - No `Origin`: not a browser (curl, a mobile app with a bearer token), so not CSRF → allowed.
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
