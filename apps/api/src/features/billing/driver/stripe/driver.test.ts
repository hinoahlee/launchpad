import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { STRIPE_API_VERSION } from "./constants.ts";
import { createStripeDriver } from "./driver.ts";

type Sent = {
	method: string;
	path: string;
	headers: Headers;
	// The form-encoded body Stripe's API takes, decoded.
	params: URLSearchParams;
};

// Swaps the network for a fake Stripe: records each request and answers with `reply`'s JSON.
function fakeStripe(reply: (sent: Sent) => object) {
	const sent: Sent[] = [];
	const fetchFn = async (
		input: string | URL | Request,
		init?: RequestInit,
	): Promise<Response> => {
		const url = new URL(String(input));
		const request: Sent = {
			method: init?.method ?? "GET",
			path: url.pathname,
			headers: new Headers(init?.headers),
			params: new URLSearchParams(
				typeof init?.body === "string" ? init.body : url.search,
			),
		};
		sent.push(request);
		return Response.json(reply(request));
	};
	const driver = createStripeDriver({
		apiKey: "rk_test_123",
		priceId: "price_123",
		httpClient: Stripe.createFetchHttpClient(fetchFn),
	});
	return { driver, sent };
}

const ORG = "11111111-1111-4111-8111-111111111111";

describe("Stripe driver", () => {
	it("creates the customer with a key per organization, and the pinned API version", async () => {
		const { driver, sent } = fakeStripe(() => ({
			id: "cus_1",
			object: "customer",
		}));
		expect(await driver.createCustomer({ organizationId: ORG })).toBe("cus_1");
		const [request] = sent;
		expect(request?.path).toBe("/v1/customers");
		expect(request?.headers.get("idempotency-key")).toBe(`customer-${ORG}`);
		expect(request?.headers.get("stripe-version")).toBe(STRIPE_API_VERSION);
		expect(request?.params.get("metadata[organizationId]")).toBe(ORG);
	});

	it("checkout: a subscription to the configured price, tagged with the organization", async () => {
		const { driver, sent } = fakeStripe(() => ({
			id: "cs_1",
			object: "checkout.session",
			url: "https://checkout.stripe.com/c/pay/cs_1",
		}));
		const url = await driver.createCheckoutSession({
			customerId: "cus_1",
			organizationId: ORG,
			successUrl: "https://app.test/account?billing=success",
			cancelUrl: "https://app.test/account",
		});
		expect(url).toBe("https://checkout.stripe.com/c/pay/cs_1");
		const params = sent[0]?.params;
		expect(sent[0]?.path).toBe("/v1/checkout/sessions");
		expect(Object.fromEntries(params ?? [])).toMatchObject({
			mode: "subscription",
			customer: "cus_1",
			"line_items[0][price]": "price_123",
			"line_items[0][quantity]": "1",
			client_reference_id: ORG,
			"subscription_data[metadata][organizationId]": ORG,
			success_url: "https://app.test/account?billing=success",
			cancel_url: "https://app.test/account",
		});
	});

	it("portal: a session for the customer that returns to the app", async () => {
		const { driver, sent } = fakeStripe(() => ({
			id: "bps_1",
			object: "billing_portal.session",
			url: "https://billing.stripe.com/p/session/1",
		}));
		await driver.createPortalSession({
			customerId: "cus_1",
			returnUrl: "https://app.test/account",
		});
		expect(sent[0]?.path).toBe("/v1/billing_portal/sessions");
		expect(sent[0]?.params.get("customer")).toBe("cus_1");
		expect(sent[0]?.params.get("return_url")).toBe("https://app.test/account");
	});

	it("current subscription: the live one first, with its item's price and period", async () => {
		const subscription = (id: string, status: string) => ({
			id,
			object: "subscription",
			status,
			cancel_at_period_end: status === "active",
			items: {
				object: "list",
				data: [
					{
						id: `si_${id}`,
						object: "subscription_item",
						price: { id: "price_123", object: "price" },
						current_period_end: 1_900_000_000,
					},
				],
			},
		});
		const list = (...subs: object[]) =>
			fakeStripe(() => ({ object: "list", has_more: false, data: subs }));

		expect(await list().driver.currentSubscription("cus_1")).toBeNull();
		// Newest first: an abandoned newer one doesn't hide the older active one.
		expect(
			await list(
				subscription("sub_new", "incomplete_expired"),
				subscription("sub_old", "active"),
			).driver.currentSubscription("cus_1"),
		).toEqual({
			id: "sub_old",
			status: "active",
			priceId: "price_123",
			currentPeriodEnd: new Date(1_900_000_000 * 1000),
			cancelAtPeriodEnd: true,
		});
		// Only ended ones: the newest, so our copy says "canceled".
		expect(
			(
				await list(
					subscription("sub_2", "canceled"),
					subscription("sub_1", "canceled"),
				).driver.currentSubscription("cus_1")
			)?.id,
		).toBe("sub_2");

		const { driver, sent } = list();
		await driver.currentSubscription("cus_1");
		expect(sent[0]?.method).toBe("GET");
		expect(sent[0]?.path).toBe("/v1/subscriptions");
		expect(sent[0]?.params.get("customer")).toBe("cus_1");
		expect(sent[0]?.params.get("status")).toBe("all");
	});
});
