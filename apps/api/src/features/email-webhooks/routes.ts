import { errorResponseSchema } from "@launchpad/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { suppress } from "#lib/email/suppression.ts";
import { verifyWebhookSignature } from "./verify-signature.ts";

const resendEvent = z.object({
	type: z.string(),
	data: z.object({
		to: z.array(z.string()).default([]),
		bounce: z.object({ type: z.string() }).optional(),
	}),
});

// Permanent bounces and spam complaints. Temporary bounces usually clear up.
function suppressionFor(event: z.output<typeof resendEvent>) {
	if (
		event.type === "email.bounced" &&
		event.data.bounce?.type === "Permanent"
	) {
		return "bounce" as const;
	}
	if (event.type === "email.complained") return "complaint" as const;
	return undefined;
}

// 204 for any genuine event, even ignored ones: anything else makes Resend retry for hours.
export function resendWebhookRoutes(secret: string): FastifyPluginAsyncZod {
	return async (app) => {
		// The signature covers the raw bytes. Scoped to this plugin.
		app.removeContentTypeParser("application/json");
		app.addContentTypeParser(
			"application/json",
			{ parseAs: "string" },
			(_request, body, done) => done(null, body),
		);

		app.post(
			"/webhooks/resend",
			{
				schema: {
					body: z.string(),
					response: {
						204: z.undefined(),
						400: errorResponseSchema,
						401: errorResponseSchema,
					},
				},
			},
			async (request, reply) => {
				const header = (name: string) => {
					const value = request.headers[name];
					return typeof value === "string" ? value : undefined;
				};
				const genuine = verifyWebhookSignature({
					secret,
					headers: {
						id: header("svix-id"),
						timestamp: header("svix-timestamp"),
						signature: header("svix-signature"),
					},
					body: request.body,
				});
				if (!genuine) {
					request.log.warn("resend webhook: bad or missing signature");
					return reply.code(401).send({ error: "invalid_signature" });
				}

				// Signed but unexpected: their format changed. 400 makes it visible in Resend's dashboard.
				const parsed = resendEvent.safeParse(safeJson(request.body));
				if (!parsed.success) {
					request.log.error(
						{ issues: parsed.error.issues },
						"resend webhook: unexpected event shape",
					);
					return reply.code(400).send({ error: "unexpected_event" });
				}

				const event = parsed.data;
				const reason = suppressionFor(event);
				if (reason) {
					for (const address of event.data.to) {
						await suppress(app.db, address, reason);
					}
				}
				// Addresses are personal data: counts only.
				request.log.info(
					{ event: event.type, suppressed: reason ? event.data.to.length : 0 },
					"resend webhook",
				);
				return reply.code(204).send();
			},
		);
	};
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}
