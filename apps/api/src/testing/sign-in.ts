import { jobs } from "@launchpad/db";
import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

// Signs `email` in through the real email-code flow (step 10.3) and returns the Cookie header that carries the
// session, as a browser would send it. The code is read from the queued send_email job. `origin` must be the
// app's APP_URL (Better Auth's CSRF check).
export async function signInWithCode(
	app: FastifyInstance,
	{
		email,
		origin,
		userAgent = "vitest",
	}: { email: string; origin: string; userAgent?: string },
): Promise<string> {
	const headers = { origin, "user-agent": userAgent };
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

	const signedIn = await app.inject({
		method: "POST",
		url: "/api/auth/sign-in/email-otp",
		headers,
		payload: { email, otp: job.code },
	});
	const cookie = signedIn.cookies.find((c) =>
		c.name.endsWith("better-auth.session_token"),
	);
	if (!cookie) throw new Error(`sign in: ${signedIn.body}`);
	return `${cookie.name}=${cookie.value}`;
}
