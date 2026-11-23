import { fromNodeHeaders } from "better-auth/node";
import type { FastifyPluginAsync } from "fastify";
import { CLIENT_IP_HEADER } from "#lib/auth/constants.ts";
import type { Auth } from "#lib/auth/create.ts";

const TOKEN_HEADERS = new Set([
	"set-auth-token",
	"access-control-expose-headers",
]);

// /api/auth/*: converts Fastify's request into a web Request for Better Auth, and its Response back.
export function authRoutes(auth: Auth, appUrl: string): FastifyPluginAsync {
	return async (app) => {
		// Better Auth parses bodies itself. Scoped to this plugin.
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
				// Overwrites whatever a client sent under this name.
				headers.set(CLIENT_IP_HEADER, request.ip);
				const body = request.body instanceof Buffer ? request.body : undefined;
				// Our own origin, never the client-controlled Host header.
				const response = await auth.handler(
					new Request(new URL(request.url, appUrl), {
						method: request.method,
						headers,
						...(body && body.length > 0 && { body }),
					}),
				);

				// Browsers keep the session in an HttpOnly cookie; a readable token header would let injected script
				// carry it off. Every browser sends Sec-Fetch-Mode and scripts can't remove it.
				const isBrowser = request.headers["sec-fetch-mode"] !== undefined;

				reply.code(response.status);
				for (const [name, value] of response.headers) {
					if (name === "set-cookie") continue;
					if (isBrowser && TOKEN_HEADERS.has(name)) continue;
					reply.header(name, value);
				}
				// One Set-Cookie line per cookie: joined, browsers drop all but the first.
				const cookies = response.headers.getSetCookie();
				if (cookies.length > 0) reply.header("set-cookie", cookies);
				return reply.send(Buffer.from(await response.arrayBuffer()));
			},
		});
	};
}
