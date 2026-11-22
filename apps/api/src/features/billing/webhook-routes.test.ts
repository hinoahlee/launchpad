import { billingSubscriptions, stripeEvents } from "@launchpad/db";
import { testDatabaseUrl } from "@launchpad/db/testing";
import { sessionResponseSchema } from "@launchpad/shared";
import Stripe from "stripe";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "#app.ts";
import { testConfig } from "#testing/config.ts";
import { signInWithCode } from "#testing/sign-in.ts";
import { createMemoryBillingDriver } from "./memory-driver.ts";

const APP_URL = "https://app.example.test";
const SECRET = "whsec_test123";
const billing = createMemoryBillingDriver();
const app = buildApp(
	testConfig({
		DATABASE_URL: testDatabaseUrl(),
		APP_URL,
		STRIPE_WEBHOOK_SECRET: SECRET,
	}),
	{ billing, rateLimitMax: 10_000 },
);
afterAll(async () => {
	await app.close();
});
beforeEach(() => {
	billing.reset();
});

// A Stripe event as the webhook receives it. Only the fields the route reads matter; the payload's subscription
// details are deliberately ignored (the route re-fetches), so `status` here can say anything.
const eventBody = (
	id: string,
	type: string,
	customer: string,
	status = "active",
) =>
	JSON.stringify({
		id,
		object: "event",
		type,
		data: {
			object: { id: "sub_payload", object: "subscription", customer, status },
		},
	});

// Signed like Stripe signs it, with the endpoint's secret (or another one).
const deliver = (body: string, secret = SECRET) =>
	app.inject({
		method: "POST",
		url: "/api/webhooks/stripe",
		headers: {
			"content-type": "application/json",
			"stripe-signature": Stripe.webhooks.generateTestHeaderString({
				payload: body,
				secret,
			}),
		},
		payload: body,
	});

// A signed-in user whose organization has a Stripe customer (made by starting a checkout).
async function customer() {
	const cookie = await signInWithCode(app, {
		email: "ada@example.com",
		origin: APP_URL,
	});
	const session = sessionResponseSchema.parse(
		(
			await app.inject({
				method: "GET",
				url: "/api/auth/get-session",
				headers: { cookie },
			})
		).json(),
	);
	const organizationId = session?.session.activeOrganizationId ?? "";
	await app.inject({
		method: "POST",
		url: `/api/organizations/${organizationId}/billing/checkout`,
		headers: { cookie },
	});
	const [customerId] = billing.customers.keys();
	if (!customerId) throw new Error("no customer");
	return { organizationId, customerId };
}

const subscriptionRows = () => app.db.select().from(billingSubscriptions);
const eventIds = async () =>
	(await app.db.select().from(stripeEvents)).map((e) => e.id).sort();

describe("Stripe webhook", () => {
	it("400 without a valid signature, and records nothing", async () => {
		const body = eventBody("evt_1", "customer.subscription.created", "cus_x");
		const unsigned = await app.inject({
			method: "POST",
			url: "/api/webhooks/stripe",
			headers: { "content-type": "application/json" },
			payload: body,
		});
		expect(unsigned.statusCode).toBe(400);
		expect((await deliver(body, "whsec_someoneelse")).statusCode).toBe(400);
		// Signed, then changed: the signature covers the exact bytes.
		const signed = await app.inject({
			method: "POST",
			url: "/api/webhooks/stripe",
			headers: {
				"content-type": "application/json",
				"stripe-signature": Stripe.webhooks.generateTestHeaderString({
					payload: body,
					secret: SECRET,
				}),
			},
			payload: body.replace("cus_x", "cus_y"),
		});
		expect(signed.statusCode).toBe(400);
		expect(await eventIds()).toEqual([]);
	});

	it("saves the subscription as Stripe has it, and records the event", async () => {
		const { organizationId, customerId } = await customer();
		billing.subscribe(customerId);
		const res = await deliver(
			eventBody("evt_1", "customer.subscription.created", customerId),
		);
		expect(res.statusCode).toBe(204);
		expect(await subscriptionRows()).toMatchObject([
			{ organizationId, status: "active", cancelAtPeriodEnd: false },
		]);
		expect(await eventIds()).toEqual(["evt_1"]);
	});

	// At-least-once delivery: Stripe sends an event again when it didn't see our 2xx (a timeout, a deploy).
	it("a duplicate delivery does nothing, even two at once", async () => {
		const { customerId } = await customer();
		billing.subscribe(customerId);
		const body = eventBody("evt_1", "invoice.paid", customerId);
		const fetchesBefore = billing.fetches;

		expect((await deliver(body)).statusCode).toBe(204);
		expect((await deliver(body)).statusCode).toBe(204);
		const both = await Promise.all([deliver(body), deliver(body)]);
		expect(both.map((r) => r.statusCode)).toEqual([204, 204]);

		// Handled once: one fetch from Stripe, one recorded event.
		expect(billing.fetches - fetchesBefore).toBe(1);
		expect(await eventIds()).toEqual(["evt_1"]);
	});

	it("two different events at once: both handled, one row", async () => {
		const { customerId } = await customer();
		billing.subscribe(customerId);
		const results = await Promise.all([
			deliver(eventBody("evt_1", "customer.subscription.created", customerId)),
			deliver(eventBody("evt_2", "invoice.paid", customerId)),
		]);
		expect(results.map((r) => r.statusCode)).toEqual([204, 204]);
		expect(await subscriptionRows()).toHaveLength(1);
		expect(await eventIds()).toEqual(["evt_1", "evt_2"]);
	});

	// Stripe doesn't promise order. The payloads say "canceled", then (late) "active": trusting them would undo
	// the cancellation. Re-fetching saves what Stripe says now, whatever order they come in.
	it("out of order: a late, older event can't undo a newer state", async () => {
		const { customerId } = await customer();
		billing.subscribe(customerId, { status: "canceled" });

		await deliver(
			eventBody(
				"evt_2",
				"customer.subscription.deleted",
				customerId,
				"canceled",
			),
		);
		expect((await subscriptionRows())[0]?.status).toBe("canceled");

		const late = await deliver(
			eventBody("evt_1", "customer.subscription.created", customerId, "active"),
		);
		expect(late.statusCode).toBe(204);
		expect((await subscriptionRows())[0]?.status).toBe("canceled");
	});

	// The handler fails after the event id was inserted (Stripe down, the database dropped the connection, the
	// process crashed). The transaction rolls back the id with everything else, so the event isn't marked handled.
	it("a crash mid-handler saves nothing, and Stripe's retry handles it", async () => {
		const { organizationId, customerId } = await customer();
		billing.subscribe(customerId);
		const body = eventBody(
			"evt_1",
			"customer.subscription.created",
			customerId,
		);

		billing.failNext();
		const failed = await deliver(body);
		expect(failed.statusCode).toBe(500);
		expect(await eventIds()).toEqual([]);
		expect(await subscriptionRows()).toEqual([]);

		const retry = await deliver(body);
		expect(retry.statusCode).toBe(204);
		expect(await eventIds()).toEqual(["evt_1"]);
		expect(await subscriptionRows()).toMatchObject([
			{ organizationId, status: "active" },
		]);
	});

	it("a customer that isn't ours: recorded, nothing else", async () => {
		const res = await deliver(
			eventBody("evt_1", "customer.subscription.created", "cus_unknown"),
		);
		expect(res.statusCode).toBe(204);
		expect(await eventIds()).toEqual(["evt_1"]);
		expect(await subscriptionRows()).toEqual([]);
		expect(billing.fetches).toBe(0);
	});

	it("events we don't act on: 204, not recorded, Stripe not asked", async () => {
		const { customerId } = await customer();
		const fetchesBefore = billing.fetches;
		const res = await deliver(
			eventBody("evt_1", "customer.created", customerId),
		);
		expect(res.statusCode).toBe(204);
		expect(await eventIds()).toEqual([]);
		expect(billing.fetches).toBe(fetchesBefore);
	});
});

describe("Stripe webhook off", () => {
	it("no route without the signing secret", async () => {
		const off = buildApp(
			testConfig({ DATABASE_URL: testDatabaseUrl(), APP_URL }),
			{
				billing,
			},
		);
		try {
			const res = await off.inject({
				method: "POST",
				url: "/api/webhooks/stripe",
				headers: { "content-type": "application/json" },
				payload: "{}",
			});
			expect(res.statusCode).toBe(404);
		} finally {
			await off.close();
		}
	});
});
