import type { FastifyHelmetOptions } from "@fastify/helmet";

// The CSP allows no inline scripts or styles: UI code must not rely on them.
export function securityHeaders(
	storageOrigin: string | undefined,
): FastifyHelmetOptions {
	return {
		contentSecurityPolicy: {
			useDefaults: false,
			directives: {
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'"],
				scriptSrcAttr: ["'none'"],
				styleSrc: ["'self'"],
				imgSrc: ["'self'", "data:"],
				fontSrc: ["'self'"],
				connectSrc: [
					"'self'",
					"https://*.ingest.sentry.io",
					"https://*.ingest.us.sentry.io",
					"https://*.ingest.de.sentry.io",
					// Browsers upload straight to the bucket.
					...(storageOrigin ? [storageOrigin] : []),
				],
				objectSrc: ["'none'"],
				baseUri: ["'self'"],
				formAction: ["'self'"],
				frameAncestors: ["'none'"],
			},
		},
		strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
	};
}
