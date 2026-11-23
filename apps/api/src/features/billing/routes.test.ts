import { billingCustomers, members, users } from "@launchpad/db";
import { testDatabaseUrl } from "@launchpad/db/testing";
import {
	billingRedirectResponseSchema,
	billingResponseSchema,
	errorResponseSchema,
	sessionResponseSchema,
} from "@launchpad/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "#app.ts";
import { testConfig } from "#testing/config.ts";
import { signInWithCode } from "#testing/sign-in.ts";
import { createMemoryBillingDriver } from "./driver/memory/driver.ts";

const APP_URL = "https://app.example.test";
const billing = createMemoryBillingDriver();
const app = buildApp(testConfig({ DATABASE_URL: testDatabaseUrl(), APP_URL }), {
	billing,
	rateLimitMax: 10_000,
});
afterAll(async () => {
	await app.close();
});
// Tables are emptied before each test (testing/setup.ts); empty "Stripe" with them.
beforeEach(() => {
	billing.reset();
});

const signIn = (email: string) =>
	signInWithCode(app, { email, origin: APP_URL });

// The signed-in user's organization, as the web app reads it.
const orgOf = async (cookie: string) => {
	const session = sessionResponseSchema.parse(
		(
			await app.inject({
				method: "GET",
				url: "/api/auth/get-session",
				headers: { cookie },
			})
		).json(),
	);
	const id = session?.session.activeOrganizationId;
	if (!id) throw new Error("no active organization");
	return id;
};

const call = (
	method: "GET" | "POST",
	path: "" | "/checkout" | "/portal" | "/sync",
	organizationId: string,
	cookie?: string,
) =>
	app.inject({
		method,
		url: `/api/organizations/${organizationId}/billing${path}`,
		headers: cookie ? { cookie } : {},
	});

const customerOf = async (organizationId: string) => {
	const [row] = await app.db
		.select()
		.from(billingCustomers)
		.where(eq(billingCustomers.organizationId, organizationId));
	return row?.stripeCustomerId;
};

describe("billing", () => {
	it("401 without a session", async () => {
		const org = "00000000-0000-4000-8000-000000000000";
		for (const path of ["", "/checkout", "/portal", "/sync"] as const) {
			const res = await call(path ? "POST" : "GET", path, org);
			expect(res.statusCode).toBe(401);
		}
	});

	it("400 on an organization id that isn't a uuid", async () => {
		const ada = await signIn("ada@example.com");
		const res = await call("POST", "/checkout", "not-a-uuid", ada);
		expect(res.statusCode).toBe(400);
		expect(res.json()).toMatchObject({ error: "validation_failed" });
	});

	it("checkout: makes the customer once, then sends to Stripe", async () => {
		const ada = await signIn("ada@example.com");
		const org = await orgOf(ada);
		expect(
			billingResponseSchema.parse((await call("GET", "", org, ada)).json()),
		).toEqual({ enabled: true, subscribed: false, plan: "free" });

		const first = await call("POST", "/checkout", org, ada);
		expect(first.statusCode).toBe(200);
		const { url } = billingRedirectResponseSchema.parse(first.json());
		const customerId = await customerOf(org);
		expect(customerId).toBeDefined();
		expect(new URL(url).searchParams.get("customer")).toBe(customerId);
		// Back to our app after paying.
		expect(new URL(url).searchParams.get("success_url")).toBe(
			`${APP_URL}/account?billing=success`,
		);

		// Abandoned checkout, tried again: the same customer, not a second one.
		expect((await call("POST", "/checkout", org, ada)).statusCode).toBe(200);
		expect(await customerOf(org)).toBe(customerId);
		expect(billing.customers.size).toBe(1);
	});

	it("two checkouts at once make one customer", async () => {
		const ada = await signIn("ada@example.com");
		const org = await orgOf(ada);
		const results = await Promise.all([
			call("POST", "/checkout", org, ada),
			call("POST", "/checkout", org, ada),
		]);
		expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
		const rows = await app.db.select().from(billingCustomers);
		expect(rows).toHaveLength(1);
	});

	// Paid at Checkout, but the webhook hasn't arrived (or webhooks are off): our copy lags behind Stripe.
	it("once paid: checkout refuses a second, sync catches up, the portal opens", async () => {
		const ada = await signIn("ada@example.com");
		const org = await orgOf(ada);
		await call("POST", "/checkout", org, ada);
		const customerId = (await customerOf(org)) ?? "";
		billing.subscribe(customerId);

		// GET reads our copy only: not yet.
		expect((await call("GET", "", org, ada)).json()).toEqual({
			enabled: true,
			subscribed: false,
			plan: "free",
		});
		// Checkout asks Stripe before deciding, so a second subscription is refused even now.
		const again = await call("POST", "/checkout", org, ada);
		expect(again.statusCode).toBe(409);
		expect(errorResponseSchema.parse(again.json()).error).toBe(
			"already_subscribed",
		);
		// That refusal synced our copy; /sync does the same on demand.
		expect((await call("POST", "/sync", org, ada)).json()).toEqual({
			enabled: true,
			subscribed: true,
			plan: "pro",
		});
		expect((await call("GET", "", org, ada)).json()).toEqual({
			enabled: true,
			subscribed: true,
			plan: "pro",
		});

		const portal = await call("POST", "/portal", org, ada);
		expect(portal.statusCode).toBe(200);
		const { url } = billingRedirectResponseSchema.parse(portal.json());
		expect(new URL(url).searchParams.get("customer")).toBe(customerId);
		expect(new URL(url).searchParams.get("return_url")).toBe(
			`${APP_URL}/account?billing=updated`,
		);
	});

	it("sync: a canceled subscription counts as not subscribed", async () => {
		const ada = await signIn("ada@example.com");
		const org = await orgOf(ada);
		await call("POST", "/checkout", org, ada);
		const customerId = (await customerOf(org)) ?? "";
		billing.subscribe(customerId);
		await call("POST", "/sync", org, ada);
		billing.subscribe(customerId, { status: "canceled" });
		expect((await call("POST", "/sync", org, ada)).json()).toEqual({
			enabled: true,
			subscribed: false,
			plan: "free",
		});
		// A canceled subscription doesn't block subscribing again.
		expect((await call("POST", "/checkout", org, ada)).statusCode).toBe(200);
	});

	// Subscribed (manage it, don't start another) but not paid: the plan follows payment, not the subscription.
	it("a subscription that isn't paid keeps the free plan", async () => {
		const ada = await signIn("ada@example.com");
		const org = await orgOf(ada);
		await call("POST", "/checkout", org, ada);
		const customerId = (await customerOf(org)) ?? "";
		for (const status of ["incomplete", "unpaid"]) {
			billing.subscribe(customerId, { status });
			expect((await call("POST", "/sync", org, ada)).json()).toEqual({
				enabled: true,
				subscribed: true,
				plan: "free",
			});
		}
	});

	it("portal: 409 before any checkout", async () => {
		const ada = await signIn("ada@example.com");
		const res = await call("POST", "/portal", await orgOf(ada), ada);
		expect(res.statusCode).toBe(409);
		expect(errorResponseSchema.parse(res.json()).error).toBe(
			"no_billing_account",
		);
	});

	// Tenant isolation: another organization's billing doesn't exist for you.
	it("404 on another organization, and nothing is made there", async () => {
		const ada = await signIn("ada@example.com");
		const bob = await signIn("bob@example.com");
		const bobOrg = await orgOf(bob);
		for (const path of ["", "/checkout", "/portal", "/sync"] as const) {
			const res = await call(path ? "POST" : "GET", path, bobOrg, ada);
			expect(res.statusCode).toBe(404);
		}
		expect(await customerOf(bobOrg)).toBeUndefined();
		expect(billing.customers.size).toBe(0);
	});

	// Everyone owns their organization today; a team's `member` sees the plan but can't spend.
	it("a member sees the plan, but checkout and portal are 403", async () => {
		const ada = await signIn("ada@example.com");
		const org = await orgOf(ada);
		const [user] = await app.db
			.select()
			.from(users)
			.where(eq(users.email, "ada@example.com"));
		await app.db
			.update(members)
			.set({ role: "member" })
			.where(eq(members.userId, user?.id ?? ""));

		expect((await call("GET", "", org, ada)).statusCode).toBe(200);
		expect((await call("POST", "/sync", org, ada)).statusCode).toBe(200);
		expect((await call("POST", "/checkout", org, ada)).statusCode).toBe(403);
		expect((await call("POST", "/portal", org, ada)).statusCode).toBe(403);
		expect(billing.customers.size).toBe(0);
	});
});

describe("billing off", () => {
	// GET still answers (a 404 would be a console error on /account); there's nothing to buy or manage.
	it("without Stripe settings: GET says off, checkout and portal don't exist", async () => {
		const off = buildApp(
			testConfig({ DATABASE_URL: testDatabaseUrl(), APP_URL }),
		);
		try {
			const ada = await signInWithCode(off, {
				email: "ada@example.com",
				origin: APP_URL,
			});
			const org = await orgOf(ada);
			const inject = (method: "GET" | "POST", path = "") =>
				off.inject({
					method,
					url: `/api/organizations/${org}/billing${path}`,
					headers: { cookie: ada },
				});
			const res = await inject("GET");
			expect(res.statusCode).toBe(200);
			expect(res.json()).toEqual({
				enabled: false,
				subscribed: false,
				plan: "free",
			});
			expect((await inject("POST", "/checkout")).statusCode).toBe(404);
			expect((await inject("POST", "/portal")).statusCode).toBe(404);
			expect((await inject("POST", "/sync")).statusCode).toBe(404);
			// Still an org-scoped route: someone else's organization is a 404.
			const bob = await signInWithCode(off, {
				email: "bob@example.com",
				origin: APP_URL,
			});
			const other = await off.inject({
				method: "GET",
				url: `/api/organizations/${await orgOf(bob)}/billing`,
				headers: { cookie: ada },
			});
			expect(other.statusCode).toBe(404);
		} finally {
			await off.close();
		}
	});
});
