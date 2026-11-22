import { members, organizations, users } from "@launchpad/db";
import { insertUser, testDatabaseUrl } from "@launchpad/db/testing";
import {
	authErrorResponseSchema,
	sessionResponseSchema,
} from "@launchpad/shared";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { buildApp } from "#app.ts";
import { testConfig } from "#testing/config.ts";
import { signInWithCode } from "#testing/sign-in.ts";
import { PERSONAL_ORGANIZATION_NAME } from "./personal-organization.ts";

// Decision 010: one person, one organization. These prove every way to change that is refused, by Better Auth's
// settings and, under them, by the database.

const APP_URL = "https://app.example.test";
const app = buildApp(testConfig({ DATABASE_URL: testDatabaseUrl(), APP_URL }));
afterAll(async () => {
	await app.close();
});

const signIn = (email: string) =>
	signInWithCode(app, { email, origin: APP_URL });
const get = (url: string, cookie: string) =>
	app.inject({ method: "GET", url, headers: { cookie } });
const post = (path: string, cookie: string, payload: object) =>
	app.inject({
		method: "POST",
		url: `/api/auth/organization/${path}`,
		headers: { cookie, origin: APP_URL },
		payload,
	});

const activeOrganizationId = async (cookie: string) =>
	sessionResponseSchema.parse(
		(await get("/api/auth/get-session", cookie)).json(),
	)?.session.activeOrganizationId;
const organizationList = async (cookie: string) =>
	z
		.array(z.object({ id: z.string(), name: z.string() }))
		.parse((await get("/api/auth/organization/list", cookie)).json());
const membershipOf = async (email: string) => {
	const [row] = await app.db
		.select({ id: members.id, organizationId: members.organizationId })
		.from(members)
		.innerJoin(users, eq(users.id, members.userId))
		.where(eq(users.email, email));
	if (!row) throw new Error(`no membership for ${email}`);
	return row;
};
const refused = (
	res: { statusCode: number; json: () => unknown },
	status: number,
	code: string,
) => {
	expect(res.statusCode).toBe(status);
	expect(authErrorResponseSchema.parse(res.json()).code).toBe(code);
};
// Drizzle wraps the driver error; 23505 is Postgres' unique_violation.
const uniqueViolation = { cause: { code: "23505" } };

describe("each user's organization", () => {
	it("is made at first sign-in, owned by the user alone, and active", async () => {
		const cookie = await signIn("ada@example.com");

		const orgs = await organizationList(cookie);
		expect(orgs).toEqual([
			{ id: expect.any(String), name: PERSONAL_ORGANIZATION_NAME },
		]);
		expect(await activeOrganizationId(cookie)).toBe(orgs[0]?.id);

		const member = z
			.object({ role: z.string() })
			.parse(
				(await get("/api/auth/organization/get-active-member", cookie)).json(),
			);
		expect(member.role).toBe("owner");
		expect(await app.db.$count(members)).toBe(1);
	});

	it("is made once: another sign-in starts in the same one", async () => {
		const first = await signIn("ada@example.com");
		const second = await signIn("ada@example.com");

		expect(await app.db.$count(organizations)).toBe(1);
		expect(await activeOrganizationId(second)).toBe(
			await activeOrganizationId(first),
		);
	});

	it("is made again at the next sign-in if it's missing", async () => {
		const cookie = await signIn("ada@example.com");
		await app.db.delete(organizations);
		// The session's organization is cleared with it (ON DELETE SET NULL).
		expect(await activeOrganizationId(cookie)).toBeNull();

		const again = await signIn("ada@example.com");
		expect(await organizationList(again)).toHaveLength(1);
	});

	it("goes with the account; other users' are untouched", async () => {
		const ada = await signIn("ada@example.com");
		const bob = await signIn("bob@example.com");
		const adas = await activeOrganizationId(ada);

		const res = await app.inject({
			method: "POST",
			url: "/api/auth/delete-user",
			headers: { cookie: ada, origin: APP_URL },
			payload: {},
		});
		expect(res.statusCode).toBe(200);

		const left = await app.db
			.select({ id: organizations.id })
			.from(organizations);
		expect(left).toEqual([{ id: await activeOrganizationId(bob) }]);
		expect(left[0]?.id).not.toBe(adas);
	});
});

describe("Better Auth refuses every change", () => {
	it("creating another organization", async () => {
		const cookie = await signIn("ada@example.com");
		const res = await post("create", cookie, { name: "Acme", slug: "acme" });
		refused(res, 403, "YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION");
	});

	it("deleting it", async () => {
		const cookie = await signIn("ada@example.com");
		const res = await post("delete", cookie, {
			organizationId: await activeOrganizationId(cookie),
		});
		refused(res, 404, "ORGANIZATION_DELETION_DISABLED");
	});

	it("renaming it", async () => {
		const cookie = await signIn("ada@example.com");
		const res = await post("update", cookie, {
			organizationId: await activeOrganizationId(cookie),
			data: { name: "Acme" },
		});
		refused(res, 403, "ORGANIZATION_UPDATE_DISABLED");
	});

	it("inviting someone", async () => {
		const cookie = await signIn("ada@example.com");
		const res = await post("invite-member", cookie, {
			organizationId: await activeOrganizationId(cookie),
			email: "bob@example.com",
			role: "member",
		});
		refused(res, 403, "INVITATION_LIMIT_REACHED");
	});

	it("leaving it, or giving up the owner role", async () => {
		const cookie = await signIn("ada@example.com");
		const { id, organizationId } = await membershipOf("ada@example.com");

		refused(
			await post("leave", cookie, { organizationId }),
			400,
			"YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER",
		);
		refused(
			await post("update-member-role", cookie, {
				organizationId,
				memberId: id,
				role: "member",
			}),
			400,
			"YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER",
		);
	});

	it("switching to someone else's", async () => {
		const ada = await signIn("ada@example.com");
		const bob = await signIn("bob@example.com");
		const res = await post("set-active", ada, {
			organizationId: await activeOrganizationId(bob),
		});
		refused(res, 403, "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION");
	});

	it("401 without a session", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/api/auth/organization/list",
		});
		expect(res.statusCode).toBe(401);
	});
});

// Under Better Auth: a script, a future route or a race can't break the rule either.
describe("the database refuses", () => {
	it("a second organization for a user", async () => {
		await signIn("ada@example.com");
		const [other] = await app.db
			.insert(organizations)
			.values({ name: "Other", slug: "other" })
			.returning();
		const [ada] = await app.db
			.select()
			.from(users)
			.where(eq(users.email, "ada@example.com"));

		await expect(
			app.db.insert(members).values({
				organizationId: other?.id ?? "",
				userId: ada?.id ?? "",
				role: "owner",
			}),
		).rejects.toMatchObject(uniqueViolation);
	});

	it("a second member in an organization", async () => {
		await signIn("ada@example.com");
		const { organizationId } = await membershipOf("ada@example.com");
		const bob = await insertUser(app.db, { email: "bob@example.com" });

		await expect(
			app.db
				.insert(members)
				.values({ organizationId, userId: bob.id, role: "member" }),
		).rejects.toMatchObject(uniqueViolation);
	});
});
