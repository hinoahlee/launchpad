import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { jobs, users, verifications } from "@launchpad/db";
import { testDatabaseUrl } from "@launchpad/db/testing";
import {
	authErrorResponseSchema,
	emailCodeSignInResponseSchema,
	sessionResponseSchema,
	socialSignInResponseSchema,
} from "@launchpad/shared";
import { desc, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "#app.ts";
import { SIGN_IN_CODES_PER_HOUR } from "#lib/auth/constants.ts";
import { testConfig } from "#testing/config.ts";

const APP_URL = "https://app.example.test";
const app = buildApp(testConfig({ DATABASE_URL: testDatabaseUrl(), APP_URL }));
afterAll(async () => {
	await app.close();
});

describe("/api/auth", () => {
	it("answers through Better Auth (GET /api/auth/ok)", async () => {
		const res = await app.inject({ method: "GET", url: "/api/auth/ok" });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ ok: true });
	});

	it("has no session without a cookie", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/api/auth/get-session",
		});
		expect(res.statusCode).toBe(200);
		expect(sessionResponseSchema.parse(res.json())).toBeNull();
	});

	// CSRF: another site's page making the visitor's browser post here, with their cookie attached.
	it("rejects a sign-out posted from another site", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/auth/sign-out",
			headers: {
				origin: "https://evil.example",
				cookie: "better-auth.session_token=stolen",
			},
		});
		expect(res.statusCode).toBe(403);
	});

	it("accepts the same request from our own origin", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/auth/sign-out",
			headers: {
				origin: APP_URL,
				cookie: "better-auth.session_token=stolen",
			},
		});
		expect(res.statusCode).toBe(200);
	});

	it("still serves the rest of /api with its own JSON parsing", async () => {
		const res = await app.inject({ method: "GET", url: "/api/health" });
		expect(res.json()).toEqual({ status: "ok" });
	});
});

describe("Google sign-in", () => {
	const google = buildApp(
		testConfig({
			DATABASE_URL: testDatabaseUrl(),
			APP_URL,
			GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
			GOOGLE_CLIENT_SECRET: "client-secret",
		}),
	);
	afterAll(async () => {
		await google.close();
	});

	const startSignIn = (target = google) =>
		target.inject({
			method: "POST",
			url: "/api/auth/sign-in/social",
			headers: { origin: APP_URL },
			payload: {
				provider: "google",
				callbackURL: "/",
				errorCallbackURL: "/sign-in",
			},
		});

	it("sends the browser to Google, with our callback and PKCE", async () => {
		const res = await startSignIn();
		expect(res.statusCode).toBe(200);
		const { url } = socialSignInResponseSchema.parse(res.json());
		const google = new URL(url);
		expect(google.origin + google.pathname).toBe(
			"https://accounts.google.com/o/oauth2/v2/auth",
		);
		const params = google.searchParams;
		expect(params.get("client_id")).toBe(
			"client-id.apps.googleusercontent.com",
		);
		// Must match a redirect URI listed in the Google client exactly.
		expect(params.get("redirect_uri")).toBe(
			`${APP_URL}/api/auth/callback/google`,
		);
		expect(params.get("response_type")).toBe("code");
		expect(params.get("scope")?.split(" ")).toEqual(
			expect.arrayContaining(["openid", "email", "profile"]),
		);
		expect(params.get("code_challenge_method")).toBe("S256");
		expect(params.get("state")).toBeTruthy();
		expect(params.get("prompt")).toBe("select_account");
	});

	it("is off when no Google client is configured", async () => {
		const res = await startSignIn(app);
		expect(res.statusCode).toBe(404);
	});

	// Someone opens the callback without starting a sign-in here (or after it expired): our page explains it.
	it("sends a failed callback to our sign-in page with the error", async () => {
		const res = await google.inject({
			method: "GET",
			url: "/api/auth/callback/google?code=abc&state=unknown",
		});
		expect(res.statusCode).toBe(302);
		const location = new URL(String(res.headers.location));
		expect(location.origin + location.pathname).toBe(`${APP_URL}/sign-in`);
		expect(location.searchParams.get("error")).toMatch(/^state_/);
	});
});

describe("email code sign-in", () => {
	const EMAIL = "ada@example.com";
	const post = (url: string, payload: object, target = app) =>
		target.inject({
			method: "POST",
			url,
			headers: { origin: APP_URL },
			payload,
		});
	const sendCode = (email = EMAIL, target = app) =>
		post(
			"/api/auth/email-otp/send-verification-otp",
			{ email, type: "sign-in" },
			target,
		);
	const signIn = (otp: string, email = EMAIL) =>
		post("/api/auth/sign-in/email-otp", { email, otp });
	// The code as the worker will email it: the payload of the queued send_email job.
	const queuedCode = async () => {
		const rows = await app.db.select().from(jobs);
		expect(rows).toHaveLength(1);
		const payload = rows[0]?.payload as {
			template: string;
			to: string;
			props: { code: string };
		};
		expect(payload).toMatchObject({ template: "sign-in-code", to: EMAIL });
		return payload.props.code;
	};
	const wrong = (code: string) => (code === "000000" ? "111111" : "000000");
	const errorCode = (res: { json: () => unknown }) =>
		authErrorResponseSchema.parse(res.json()).code;

	it("queues an email with a 6-digit code; the verifications table stores only its hash", async () => {
		const res = await sendCode();
		expect(res.statusCode).toBe(200);
		const code = await queuedCode();
		expect(code).toMatch(/^\d{6}$/);

		const [stored] = await app.db.select().from(verifications);
		expect(stored?.identifier).toBe(`sign-in-otp-${EMAIL}`);
		expect(stored?.value).not.toContain(code);
	});

	it("signs in a new address: creates the user, verified, and sets the session cookie", async () => {
		await sendCode();
		const res = await signIn(await queuedCode());
		expect(res.statusCode).toBe(200);
		expect(emailCodeSignInResponseSchema.parse(res.json()).user.email).toBe(
			EMAIL,
		);

		const [user] = await app.db
			.select()
			.from(users)
			.where(eq(users.email, EMAIL));
		expect(user?.emailVerified).toBe(true);
		expect(user?.lastLoginMethod).toBe("email-otp");

		// `__Secure-` prefix: APP_URL is https, so browsers only send it over https.
		const cookie = res.cookies.find(
			(c) => c.name === "__Secure-better-auth.session_token",
		);
		expect(cookie).toMatchObject({ httpOnly: true, secure: true });
		const session = await app.inject({
			method: "GET",
			url: "/api/auth/get-session",
			cookies: { [cookie?.name ?? ""]: cookie?.value ?? "" },
		});
		expect(sessionResponseSchema.parse(session.json())?.user.email).toBe(EMAIL);
	});

	it("works once", async () => {
		await sendCode();
		const code = await queuedCode();
		expect((await signIn(code)).statusCode).toBe(200);
		const again = await signIn(code);
		expect(again.statusCode).toBe(400);
		expect(errorCode(again)).toBe("INVALID_OTP");
	});

	it("matches the address whatever its case", async () => {
		await sendCode("Ada@Example.com");
		const res = await signIn(await queuedCode(), "ADA@example.com");
		expect(res.statusCode).toBe(200);
	});

	// Brute-force protection: a guesser gets 3 tries per code, then needs a new email.
	it("refuses the code after 3 wrong guesses, even the right one", async () => {
		await sendCode();
		const code = await queuedCode();
		for (let i = 0; i < 3; i++) {
			const res = await signIn(wrong(code));
			expect(res.statusCode).toBe(400);
			expect(errorCode(res)).toBe("INVALID_OTP");
		}
		const res = await signIn(code);
		expect(res.statusCode).toBe(403);
		expect(errorCode(res)).toBe("TOO_MANY_ATTEMPTS");
		expect(await app.db.select().from(users)).toEqual([]);
	});

	it("refuses an expired code", async () => {
		await sendCode();
		const code = await queuedCode();
		await app.db
			.update(verifications)
			.set({ expiresAt: new Date(Date.now() - 1000) });
		const res = await signIn(code);
		expect(res.statusCode).toBe(400);
		expect(errorCode(res)).toBe("OTP_EXPIRED");
	});

	it("a new code replaces the old one", async () => {
		await sendCode();
		const first = await queuedCode();
		await app.db.delete(jobs);
		await sendCode();
		const second = await queuedCode();
		if (first !== second) {
			expect((await signIn(first)).statusCode).toBe(400);
		}
		expect((await signIn(second)).statusCode).toBe(200);
	});

	it("sends nothing for flows this app doesn't use", async () => {
		const res = await post("/api/auth/email-otp/send-verification-otp", {
			email: EMAIL,
			type: "forget-password",
		});
		expect(res.statusCode).toBe(200);
		expect(await app.db.select().from(jobs)).toEqual([]);
	});

	// Per address, from any number of IPs: stops one inbox from being flooded with codes.
	describe(`at most ${SIGN_IN_CODES_PER_HOUR} codes an hour per address`, () => {
		const sendMax = async (email = EMAIL) => {
			for (let i = 0; i < SIGN_IN_CODES_PER_HOUR; i++) {
				expect((await sendCode(email)).statusCode).toBe(200);
			}
		};
		const latestCode = async () => {
			const [job] = await app.db
				.select({ code: sql<string>`${jobs.payload}->'props'->>'code'` })
				.from(jobs)
				.orderBy(desc(jobs.createdAt))
				.limit(1);
			return job?.code ?? "";
		};

		it("refuses the next one with 429 TOO_MANY_CODES, and keeps the last code working", async () => {
			await sendMax();
			const code = await latestCode();

			const res = await sendCode();
			expect(res.statusCode).toBe(429);
			expect(errorCode(res)).toBe("TOO_MANY_CODES");
			// Refused before Better Auth makes a code: the one already in the inbox isn't replaced.
			expect(await app.db.select().from(jobs)).toHaveLength(
				SIGN_IN_CODES_PER_HOUR,
			);
			expect((await signIn(code)).statusCode).toBe(200);
		});

		it("never queues more than the limit, even for requests sent at once", async () => {
			const results = await Promise.all(
				Array.from({ length: SIGN_IN_CODES_PER_HOUR * 3 }, () => sendCode()),
			);
			for (const res of results) expect([200, 429]).toContain(res.statusCode);
			expect(await app.db.select().from(jobs)).toHaveLength(
				SIGN_IN_CODES_PER_HOUR,
			);
		});

		it("counts the address whatever its case", async () => {
			await sendMax();
			expect((await sendCode("ADA@example.com")).statusCode).toBe(429);
		});

		it("doesn't touch other addresses", async () => {
			await sendMax();
			expect((await sendCode("bob@example.com")).statusCode).toBe(200);
		});

		it("allows codes again once the oldest is an hour old", async () => {
			await sendMax();
			await app.db
				.update(jobs)
				.set({ createdAt: new Date(Date.now() - 61 * 60 * 1000) });
			expect((await sendCode()).statusCode).toBe(200);
		});
	});

	// Better Auth's limits are on in production only (they're in memory, per app: tests would trip each other).
	it("limits code emails to 3 a minute per IP in production", async () => {
		const webRoot = mkdtempSync(path.join(tmpdir(), "launchpad-web-"));
		writeFileSync(path.join(webRoot, "index.html"), "<!doctype html>");
		const prod = buildApp(
			testConfig({
				NODE_ENV: "production",
				DATABASE_URL: testDatabaseUrl(),
				APP_URL,
				BETTER_AUTH_SECRET: "a-test-secret-that-is-long-enough-1234",
			}),
			{ webRoot },
		);
		try {
			for (let i = 0; i < 3; i++) {
				expect((await sendCode(EMAIL, prod)).statusCode).toBe(200);
			}
			expect((await sendCode(EMAIL, prod)).statusCode).toBe(429);
			// Another address from the same IP: the limit is on the IP, not the address.
			expect((await sendCode("bob@example.com", prod)).statusCode).toBe(429);
		} finally {
			await prod.close();
		}
	});
});

describe("schema", () => {
	// Better Auth compares its expected tables and columns with our Drizzle schema (@launchpad/db). A plugin that
	// needs a field we forgot to add fails here, not on a user's first sign-in.
	it("matches what Better Auth expects", async () => {
		const ctx = await app.auth.$context;
		expect(ctx.checkSchema).toBeDefined();
		// Throws the list of differences on a mismatch; nothing once the schema has checked out.
		expect(await ctx.checkSchema?.()).toBeUndefined();
	});
});

describe("production", () => {
	it("refuses to start without APP_URL and BETTER_AUTH_SECRET", () => {
		expect(() =>
			buildApp(testConfig({ NODE_ENV: "production" }), {
				webRoot: import.meta.dirname,
			}),
		).toThrow("APP_URL and BETTER_AUTH_SECRET are required in production");
	});
});
