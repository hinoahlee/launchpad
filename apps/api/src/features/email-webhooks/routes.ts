import { errorResponseSchema } from "@launchpad/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { suppress } from "#lib/email/suppression.ts";
import { verifyWebhookSignature } from "#lib/email/webhook-signature.ts";

// The fields we use from Resend's event (they send more). Every event has `type` and `data.to`; email.bounced adds
// `data.bounce`. Not in @launchpad/shared: only Resend and the API exchange it, never the web app.
const resendEvent = z.object({
	type: z.string(),
	data: z.object({
		to: z.array(z.string()).default([]),
		bounce: z.object({ type: z.string() }).optional(),
	}),
});

// Which events mean "never email this address again". A Permanent bounce: the mailbox doesn't exist or refuses
// us for good. A Temporary one (full mailbox, server down) usually clears up, so it isn't recorded. A complaint:
// the person pressed "Report spam".
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

// POST /api/webhooks/resend: Resend calls it after each event we subscribed to (Resend → Webhooks).
// Answers 204 for any genuine event, even ones we ignore: anything other than 2xx makes Resend retry for hours.
export function resendWebhookRoutes(secret: string): FastifyPluginAsyncZod {
	return async (app) => {
		// The signature covers the exact bytes Resend sent, so this route needs the body as a string, not parsed
		// JSON. Replaced only inside this plugin: every other route still gets parsed JSON.
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

				// Signed by Resend but not the shape we expect: their format changed. A 400 makes Resend retry and
				// then show the failures in its dashboard, instead of us silently dropping bounces.
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
				// The type and count only: addresses are personal data and stay out of the logs.
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
