import { existsSync } from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

const API_PATH = /^\/api(\/|\?|$)/;

// Serves the built SPA (when there is one) and answers every unmatched URL: page loads get index.html (the
// router decides), everything else a JSON 404.
export function registerSpa(
	app: FastifyInstance,
	{ webRoot, production }: { webRoot: string; production: boolean },
): void {
	const serveWeb = existsSync(path.join(webRoot, "index.html"));
	// In dev, Vite serves the SPA. In production a missing build is a broken image.
	if (!serveWeb && production) {
		throw new Error(`SPA build not found at ${webRoot}`);
	}

	if (serveWeb) {
		app.register(fastifyStatic, {
			root: webRoot,
			cacheControl: false,
			setHeaders: (reply, filePath) => {
				// Vite content-hashes everything under assets/.
				const hashed = filePath.includes(`${path.sep}assets${path.sep}`);
				reply.header(
					"Cache-Control",
					hashed ? "public, max-age=31536000, immutable" : "no-cache",
				);
			},
		});
	}

	app.setNotFoundHandler((request, reply) => {
		const isPageLoad =
			(request.method === "GET" || request.method === "HEAD") &&
			!API_PATH.test(request.url) &&
			request.headers.accept?.includes("text/html");
		if (serveWeb && isPageLoad) {
			return reply.sendFile("index.html");
		}
		reply.code(404);
		return { error: "not_found" };
	});
}
