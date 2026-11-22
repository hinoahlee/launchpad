import { members, organizations, sessions, users } from "@launchpad/db";
import { testDatabaseUrl } from "@launchpad/db/testing";
import {
	activeMemberResponseSchema,
	authErrorResponseSchema,
	organizationListResponseSchema,
	organizationSchema,
	sessionResponseSchema,
} from "@launchpad/shared";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "#app.ts";
import { testConfig } from "#testing/config.ts";
import { signInWithCode } from "#testing/sign-in.ts";
import { PERSONAL_ORGANIZATION_NAME } from "./personal-organization.ts";

const APP_URL = "https://app.example.test";
const app = buildApp(testConfig({ DATABASE_URL: testDatabaseUrl(), APP_URL }));
afterAll(async () => {
	await app.close();
});

const signIn = (email: string) =>
	signInWithCode(app, { email, origin: APP_URL });
const get = (url: string, cookie: string) =>
	app.inject({ method: "GET", url, headers: { cookie } });
const post = (url: string, cookie: string, payload: object) =>
	app.inject({
		method: "POST",
		url,
		headers: { cookie, origin: APP_URL },
		payload,
	});

const activeOrganizationId = async (cookie: string) =>
	sessionResponseSchema.parse(
		(await get("/api/auth/get-session", cookie)).json(),
	)?.session.activeOrganizationId;
const listOrganizations = async (cookie: string) =>
	organizationListResponseSchema.parse(
		(await get("/api/auth/organization/list", cookie)).json(),
	);
const createOrganization = (cookie: string, name: string, slug = name) =>
	post("/api/auth/organization/create", cookie, { name, slug });
const setActive = (cookie: string, organizationId: string) =>
	post("/api/auth/organization/set-active", cookie, { organizationId });
const errorCode = (res: { json: () => unknown }) =>
	authErrorResponseSchema.parse(res.json()).code;

describe("personal organization", () => {
	it("is created on first sign-in, owned by the user, and active", async () => {
		const cookie = await signIn("ada@example.com");

		const orgs = await listOrganizations(cookie);
		expect(orgs).toHaveLength(1);
		expect(orgs[0]?.name).toBe(PERSONAL_ORGANIZATION_NAME);
		expect(await activeOrganizationId(cookie)).toBe(orgs[0]?.id);

		const member = activeMemberResponseSchema.parse(
			(await get("/api/auth/organization/get-active-member", cookie)).json(),
		);
		expect(member.role).toBe("owner");
	});

	it("is made once: a second sign-in starts in the same organization", async () => {
		const first = await signIn("ada@example.com");
		const second = await signIn("ada@example.com");

		expect(await app.db.$count(organizations)).toBe(1);
		expect(await activeOrganizationId(second)).toBe(
			await activeOrganizationId(first),
		);
	});

	it("is made again for a user left with no organization", async () => {
		const cookie = await signIn("ada@example.com");
		await app.db.delete(organizations);
		// The session's active organization is cleared with it (ON DELETE SET NULL).
		expect(await activeOrganizationId(cookie)).toBeNull();

		const again = await signIn("ada@example.com");
		expect(await listOrganizations(again)).toHaveLength(1);
	});
});

describe("creating and switching", () => {
	it("creates an organization owned by its creator and switches to it", async () => {
		const cookie = await signIn("ada@example.com");
		const res = await createOrganization(cookie, "Acme", "acme-x1y2z3");
		expect(res.statusCode).toBe(200);
		const acme = organizationSchema.parse(res.json());

		expect(await activeOrganizationId(cookie)).toBe(acme.id);
		const [member] = await app.db
			.select()
			.from(members)
			.where(eq(members.organizationId, acme.id));
		expect(member?.role).toBe("owner");
		expect((await listOrganizations(cookie)).map((o) => o.name).sort()).toEqual(
			["Acme", PERSONAL_ORGANIZATION_NAME],
		);
	});

	it("switches back to another of your organizations", async () => {
		const cookie = await signIn("ada@example.com");
		const personal = await activeOrganizationId(cookie);
		await createOrganization(cookie, "Acme", "acme-x1y2z3");

		const res = await setActive(cookie, personal ?? "");
		expect(res.statusCode).toBe(200);
		expect(await activeOrganizationId(cookie)).toBe(personal);
	});

	it("refuses to switch to someone else's organization", async () => {
		const ada = await signIn("ada@example.com");
		const bob = await signIn("bob@example.com");
		const bobsOrg = await activeOrganizationId(bob);

		const res = await setActive(ada, bobsOrg ?? "");
		expect(res.statusCode).toBe(403);
		expect(errorCode(res)).toBe("USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION");
	});

	it("refuses a blank or too-long name", async () => {
		const cookie = await signIn("ada@example.com");
		for (const name of ["   ", "x".repeat(65)]) {
			const res = await createOrganization(cookie, name, "some-slug");
			expect(res.statusCode).toBe(400);
			expect(errorCode(res)).toBe("INVALID_ORGANIZATION_NAME");
		}
	});

	it("refuses a slug that's taken", async () => {
		const cookie = await signIn("ada@example.com");
		await createOrganization(cookie, "Acme", "acme");
		const res = await createOrganization(cookie, "Acme again", "acme");
		expect(res.statusCode).toBe(400);
		expect(errorCode(res)).toBe("ORGANIZATION_ALREADY_EXISTS");
	});

	it("401 without a session", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/api/auth/organization/list",
		});
		expect(res.statusCode).toBe(401);
	});
});

describe("deleting the account", () => {
	it("deletes organizations the user was alone in, and keeps shared ones", async () => {
		const ada = await signIn("ada@example.com");
		const adasPersonal = await activeOrganizationId(ada);
		const shared = organizationSchema.parse(
			(await createOrganization(ada, "Shared", "shared")).json(),
		);
		// Bob joins Shared (invites come in 12.2; a row is enough here).
		const bob = await signIn("bob@example.com");
		const [bobUser] = await app.db
			.select()
			.from(users)
			.where(eq(users.email, "bob@example.com"));
		await app.db.insert(members).values({
			organizationId: shared.id,
			userId: bobUser?.id ?? "",
			role: "member",
		});

		const res = await post("/api/auth/delete-user", ada, {});
		expect(res.statusCode).toBe(200);

		const left = await app.db.select().from(organizations);
		expect(left.map((o) => o.id)).not.toContain(adasPersonal);
		expect(left.map((o) => o.id)).toContain(shared.id);
		// Bob's own personal organization is untouched.
		expect(await activeOrganizationId(bob)).toBeTruthy();
		expect(await app.db.$count(sessions)).toBe(1);
	});
});
