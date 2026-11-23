import { jobs } from "@launchpad/db";
import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

// The real email-code flow; the code is read from the queued send_email job.
export async function signInResponse(
	app: FastifyInstance,
	email: string,
	headers: Record<string, string>,
) {
	const sent = await app.inject({
		method: "POST",
		url: "/api/auth/email-otp/send-verification-otp",
		headers,
		payload: { email, type: "sign-in" },
	});
	if (sent.statusCode !== 200) throw new Error(`send code: ${sent.body}`);

	const [job] = await app.db
		.select({ code: sql<string>`${jobs.payload}->'props'->>'code'` })
		.from(jobs)
		.where(
			and(
				eq(jobs.type, "send_email"),
				sql`${jobs.payload}->>'to' = ${email.toLowerCase()}`,
			),
		)
		.orderBy(desc(jobs.createdAt))
		.limit(1);
	if (!job) throw new Error(`no code queued for ${email}`);

	return app.inject({
		method: "POST",
		url: "/api/auth/sign-in/email-otp",
		headers,
		payload: { email, otp: job.code },
	});
}

// As a browser: returns the Cookie header. `origin` must be the app's APP_URL.
export async function signInWithCode(
	app: FastifyInstance,
	{
		email,
		origin,
		userAgent = "vitest",
	}: { email: string; origin: string; userAgent?: string },
): Promise<string> {
	const signedIn = await signInResponse(app, email, {
		origin,
		"user-agent": userAgent,
	});
	const cookie = signedIn.cookies.find((c) =>
		c.name.endsWith("better-auth.session_token"),
	);
	if (!cookie) throw new Error(`sign in: ${signedIn.body}`);
	return `${cookie.name}=${cookie.value}`;
}

// As a non-browser client (no Origin, no Sec-Fetch-*): returns the bearer token.
export async function signInForToken(
	app: FastifyInstance,
	{ email }: { email: string },
): Promise<string> {
	const signedIn = await signInResponse(app, email, {
		"user-agent": "launchpad-test-client",
	});
	const token = signedIn.headers["set-auth-token"];
	if (typeof token !== "string") throw new Error(`sign in: ${signedIn.body}`);
	return token;
}
