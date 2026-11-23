import { billingCustomers, users } from "@launchpad/db";
import { testDatabaseUrl } from "@launchpad/db/testing";
import { sessionResponseSchema } from "@launchpad/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "#app.ts";
import { testConfig } from "#testing/config.ts";
import { signInWithCode } from "#testing/sign-in.ts";
import { createMemoryBillingDriver } from "./driver/memory/driver.ts";

// Deleting an account must stop its Stripe billing: our rows cascade away, Stripe's customer doesn't.
const APP_URL = "https://app.example.test";
const billing = createMemoryBillingDriver();
const app = buildApp(testConfig({ DATABASE_URL: testDatabaseUrl(), APP_URL }), {
	billing,
	rateLimitMax: 10_000,
});
afterAll(async () => {
	await app.close();
});
beforeEach(() => {
	billing.reset();
});

const signIn = (email: string) =>
	signInWithCode(app, { email, origin: APP_URL });

// Signs in, checks out and pays: returns the cookie and the Stripe customer.
async function subscriber(email: string) {
	const cookie = await signIn(email);
	const session = sessionResponseSchema.parse(
		(
			await app.inject({
				method: "GET",
				url: "/api/auth/get-session",
				headers: { cookie },
			})
		).json(),
	);
	const org = session?.session.activeOrganizationId;
	if (!org) throw new Error("no active organization");
	const checkout = await app.inject({
		method: "POST",
		url: `/api/organizations/${org}/billing/checkout`,
		headers: { cookie, origin: APP_URL },
	});
	expect(checkout.statusCode).toBe(200);
	const [row] = await app.db
		.select()
		.from(billingCustomers)
		.where(eq(billingCustomers.organizationId, org));
	if (!row) throw new Error("no customer");
	billing.subscribe(row.stripeCustomerId);
	return { cookie, customerId: row.stripeCustomerId };
}

const deleteAccount = (cookie: string) =>
	app.inject({
		method: "POST",
		url: "/api/auth/delete-user",
		headers: { cookie, origin: APP_URL },
		payload: {},
	});

const userExists = async (email: string) =>
	(await app.db.select().from(users).where(eq(users.email, email))).length > 0;

describe("account deletion with billing", () => {
	it("deletes the Stripe customer, which ends the subscription", async () => {
		const { cookie, customerId } = await subscriber("ada@example.com");
		const other = await subscriber("bea@example.com");

		expect((await deleteAccount(cookie)).statusCode).toBe(200);
		expect(billing.customers.has(customerId)).toBe(false);
		expect(billing.subscriptions.has(customerId)).toBe(false);
		expect(await userExists("ada@example.com")).toBe(false);
		// Only theirs.
		expect(billing.subscriptions.has(other.customerId)).toBe(true);
	});

	it("Stripe unreachable: the account stays, and a retry succeeds", async () => {
		const { cookie, customerId } = await subscriber("cy@example.com");

		billing.failNext();
		expect((await deleteAccount(cookie)).statusCode).toBe(500);
		expect(await userExists("cy@example.com")).toBe(true);
		expect(billing.subscriptions.has(customerId)).toBe(true);

		expect((await deleteAccount(cookie)).statusCode).toBe(200);
		expect(await userExists("cy@example.com")).toBe(false);
		expect(billing.customers.has(customerId)).toBe(false);
	});

	it("never checked out: nothing to delete at Stripe", async () => {
		const cookie = await signIn("dee@example.com");
		expect((await deleteAccount(cookie)).statusCode).toBe(200);
		expect(await userExists("dee@example.com")).toBe(false);
	});
});
