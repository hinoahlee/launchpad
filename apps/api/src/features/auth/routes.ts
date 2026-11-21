import { fromNodeHeaders } from "better-auth/node";
import type { FastifyPluginAsync } from "fastify";
import { type Auth, CLIENT_IP_HEADER } from "./auth.ts";

// Every Better Auth endpoint (sign in, sign out, get session...) under /api/auth/*. Better Auth speaks the web's
// Request/Response, Fastify its own: this route converts one into the other and lets Better Auth answer.
// Mounted in the /api scope, so our per-IP rate limit, request IDs and logging cover it too.
export function authRoutes(auth: Auth, appUrl: string): FastifyPluginAsync {
	return async (app) => {
		// Pass bodies through untouched, whatever their type (JSON, a form post): Better Auth parses them itself.
		// Scoped to this plugin; the rest of /api keeps Fastify's JSON parser.
		app.removeAllContentTypeParsers();
		app.addContentTypeParser(
			"*",
			{ parseAs: "buffer" },
			(_request, body, done) => done(null, body),
		);

		app.route({
			method: ["GET", "POST"],
			url: "/*",
			handler: async (request, reply) => {
				const headers = fromNodeHeaders(request.headers);
				// Overwrite whatever a client sent under this name: only our proxy-aware `request.ip` counts.
				headers.set(CLIENT_IP_HEADER, request.ip);
				const body = request.body instanceof Buffer ? request.body : undefined;
				// The URL from our own origin, never the Host header (a client can send any).
				const response = await auth.handler(
					new Request(new URL(request.url, appUrl), {
						method: request.method,
						headers,
						...(body && body.length > 0 && { body }),
					}),
				);

				// The bearer token (auth.ts) is for clients without cookies. A browser has the cookie, which page
				// scripts can't read (HttpOnly); a readable copy in a header would let injected script (XSS) carry the
				// session off to another machine. Browsers mark every request with Sec-Fetch-Mode, and scripts can't
				// remove it, so: a browser never gets the header.
				const isBrowser = request.headers["sec-fetch-mode"] !== undefined;
				const tokenHeaders = new Set([
					"set-auth-token",
					"access-control-expose-headers",
				]);

				reply.code(response.status);
				for (const [name, value] of response.headers) {
					if (name === "set-cookie") continue;
					if (isBrowser && tokenHeaders.has(name)) continue;
					reply.header(name, value);
				}
				// Each cookie needs its own Set-Cookie line; joined into one, browsers would drop all but the first.
				const cookies = response.headers.getSetCookie();
				if (cookies.length > 0) reply.header("set-cookie", cookies);
				return reply.send(Buffer.from(await response.arrayBuffer()));
			},
		});
	};
}
