import { createServer } from "node:http";

// A stand-in for the bucket during e2e (no R2 account in CI): the API points S3_ENDPOINT here and signs URLs as
// usual; the browser PUTs and downloads here, and the API asks here for sizes and deletes. It speaks just enough
// of the S3 API for that, with path-style URLs (/<bucket>/<key>). It doesn't check signatures: the S3 driver's
// unit tests cover what gets signed.
//
// CORS like the real bucket's policy (README, "File storage"): only the app's origin, PUT and GET, the
// Content-Type header. A CORS mistake in the app then fails here the way it would in production.
//
// Usage: node fake-bucket.ts <port> <allowed origin>
const [port = "3101", allowedOrigin = "http://127.0.0.1:3100"] =
	process.argv.slice(2);

const objects = new Map<string, { body: Buffer; contentType: string }>();

createServer(async (req, res) => {
	const url = new URL(req.url ?? "/", "http://bucket");
	const key = decodeURIComponent(url.pathname);

	if (req.headers.origin === allowedOrigin) {
		res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
		res.setHeader("Access-Control-Expose-Headers", "ETag");
	}

	if (key === "/health") {
		res.end("ok");
		return;
	}

	switch (req.method) {
		// The browser's preflight before its cross-origin PUT.
		case "OPTIONS": {
			if (req.headers.origin !== allowedOrigin) {
				res.writeHead(403).end();
				return;
			}
			res.setHeader("Access-Control-Allow-Methods", "PUT, GET");
			res.setHeader("Access-Control-Allow-Headers", "Content-Type");
			res.writeHead(204).end();
			return;
		}
		case "PUT": {
			const chunks: Buffer[] = [];
			for await (const chunk of req) chunks.push(chunk as Buffer);
			objects.set(key, {
				body: Buffer.concat(chunks),
				contentType: req.headers["content-type"] ?? "application/octet-stream",
			});
			res.writeHead(200, { ETag: '"fake"' }).end();
			return;
		}
		case "HEAD":
		case "GET": {
			const object = objects.get(key);
			if (!object) {
				res.writeHead(404).end();
				return;
			}
			const disposition = url.searchParams.get("response-content-disposition");
			res.writeHead(200, {
				"Content-Type": object.contentType,
				"Content-Length": object.body.length,
				...(disposition && { "Content-Disposition": disposition }),
			});
			res.end(req.method === "GET" ? object.body : undefined);
			return;
		}
		case "DELETE": {
			objects.delete(key);
			res.writeHead(204).end();
			return;
		}
		default:
			res.writeHead(405).end();
	}
}).listen(Number(port), "127.0.0.1");
