import { describe, expect, it, vi } from "vitest";
import { directDatabaseUrl, loadConfig } from "./config.ts";

const pooled = "postgres://app:pw@db.internal:6432/app";
const direct = "postgres://app:pw@db.internal:5432/app";

describe("directDatabaseUrl", () => {
	it("is DATABASE_URL when no direct URL is set", () => {
		expect(directDatabaseUrl(loadConfig({ DATABASE_URL: direct }))).toBe(
			direct,
		);
	});

	it("treats an empty DATABASE_DIRECT_URL (as in .env.example) as unset", () => {
		const config = loadConfig({
			DATABASE_URL: direct,
			DATABASE_DIRECT_URL: "",
		});
		expect(directDatabaseUrl(config)).toBe(direct);
	});

	it("is DATABASE_DIRECT_URL when DATABASE_URL goes through a pooler", () => {
		const config = loadConfig({
			DATABASE_URL: pooled,
			DATABASE_DIRECT_URL: direct,
		});
		expect(config.DATABASE_URL).toBe(pooled);
		expect(directDatabaseUrl(config)).toBe(direct);
	});
});

describe("email settings", () => {
	const base = { DATABASE_URL: direct };

	// loadConfig exits the process on a bad value; stub exit so the test sees it as a throw.
	function rejects(env: Record<string, string>): string {
		const exit = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("exit");
		});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			expect(() => loadConfig({ ...base, ...env })).toThrow("exit");
			return String(error.mock.calls[0]?.[0]);
		} finally {
			exit.mockRestore();
			error.mockRestore();
		}
	}

	it("accepts neither (emails are only logged) or both", () => {
		expect(
			loadConfig({ ...base, RESEND_API_KEY: "", EMAIL_FROM: "" }),
		).toMatchObject({
			RESEND_API_KEY: undefined,
			EMAIL_FROM: undefined,
		});
		expect(
			loadConfig({
				...base,
				RESEND_API_KEY: "re_123",
				EMAIL_FROM: "Launchpad <hello@mail.example.com>",
			}),
		).toMatchObject({ EMAIL_FROM: "Launchpad <hello@mail.example.com>" });
	});

	it("stops the boot when only one of the two is set", () => {
		expect(rejects({ RESEND_API_KEY: "re_123" })).toContain(
			"set RESEND_API_KEY and EMAIL_FROM together",
		);
	});

	it("stops the boot on a sender that isn't an address", () => {
		expect(
			rejects({ RESEND_API_KEY: "re_123", EMAIL_FROM: "Launchpad" }),
		).toContain("Name <address> or address");
	});

	// A pasted API key (re_...) instead of the webhook secret would turn the route on and reject every real event.
	it("stops the boot on a webhook secret that isn't whsec_...", () => {
		expect(loadConfig({ ...base, RESEND_WEBHOOK_SECRET: "" })).toMatchObject({
			RESEND_WEBHOOK_SECRET: undefined,
		});
		expect(rejects({ RESEND_WEBHOOK_SECRET: "re_123" })).toContain(
			"whsec_ followed by base64",
		);
	});
});

describe("Google settings", () => {
	const base = { DATABASE_URL: direct };

	it("accepts neither (Google sign-in off) or both", () => {
		expect(
			loadConfig({ ...base, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" }),
		).toMatchObject({
			GOOGLE_CLIENT_ID: undefined,
			GOOGLE_CLIENT_SECRET: undefined,
		});
		expect(
			loadConfig({
				...base,
				GOOGLE_CLIENT_ID: "id",
				GOOGLE_CLIENT_SECRET: "s",
			}),
		).toMatchObject({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s" });
	});

	it("stops the boot when only one of the two is set", () => {
		const exit = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("exit");
		});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			expect(() => loadConfig({ ...base, GOOGLE_CLIENT_ID: "id" })).toThrow(
				"exit",
			);
			expect(String(error.mock.calls[0]?.[0])).toContain(
				"set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET together",
			);
		} finally {
			exit.mockRestore();
			error.mockRestore();
		}
	});
});

describe("APP_URL", () => {
	const base = { DATABASE_URL: direct };

	// .env.example ships `APP_URL=`: it must mean "unset", not crash the boot.
	it("treats an empty value as unset", () => {
		expect(loadConfig({ ...base, APP_URL: "" }).APP_URL).toBeUndefined();
	});

	it("accepts an origin", () => {
		expect(
			loadConfig({ ...base, APP_URL: "https://app.example.com" }).APP_URL,
		).toBe("https://app.example.com");
	});

	it("stops the boot on a URL with a path, or not a URL", () => {
		for (const APP_URL of ["https://app.example.com/app", "app.example.com"]) {
			const exit = vi.spyOn(process, "exit").mockImplementation(() => {
				throw new Error("exit");
			});
			const error = vi.spyOn(console, "error").mockImplementation(() => {});
			try {
				expect(() => loadConfig({ ...base, APP_URL })).toThrow("exit");
				expect(error).toHaveBeenCalled();
			} finally {
				exit.mockRestore();
				error.mockRestore();
			}
		}
	});
});

describe("storage settings", () => {
	const base = { DATABASE_URL: direct };
	const r2 = {
		S3_ENDPOINT: "https://abc123.r2.cloudflarestorage.com",
		S3_BUCKET: "launchpad-dev",
		S3_ACCESS_KEY_ID: "key",
		S3_SECRET_ACCESS_KEY: "secret",
	};

	function rejects(env: Record<string, string>): string {
		const exit = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("exit");
		});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			expect(() => loadConfig({ ...base, ...env })).toThrow("exit");
			return String(error.mock.calls[0]?.[0]);
		} finally {
			exit.mockRestore();
			error.mockRestore();
		}
	}

	// .env.example ships every S3_ key empty: that means "uploads off", not a crash.
	it("treats empty values as unset (uploads off)", () => {
		expect(
			loadConfig({
				...base,
				S3_ENDPOINT: "",
				S3_BUCKET: "",
				S3_ACCESS_KEY_ID: "",
				S3_SECRET_ACCESS_KEY: "",
			}),
		).toMatchObject({ S3_BUCKET: undefined, S3_ENDPOINT: undefined });
	});

	it("accepts R2 with the default region, auto", () => {
		expect(loadConfig({ ...base, ...r2 })).toMatchObject({
			S3_BUCKET: "launchpad-dev",
			S3_REGION: "auto",
		});
	});

	it("accepts AWS S3: no endpoint, a real region", () => {
		const { S3_ENDPOINT: _, ...aws } = r2;
		const config = loadConfig({ ...base, ...aws, S3_REGION: "us-east-1" });
		expect(config.S3_ENDPOINT).toBeUndefined();
		expect(config.S3_REGION).toBe("us-east-1");
	});

	it("stops the boot on a bucket without keys, or keys without a bucket", () => {
		expect(rejects({ S3_BUCKET: "launchpad-dev" })).toContain(
			"set S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY together",
		);
		expect(
			rejects({ S3_ACCESS_KEY_ID: "key", S3_SECRET_ACCESS_KEY: "secret" }),
		).toContain("together");
	});

	it("stops the boot on AWS S3 without a region", () => {
		const { S3_ENDPOINT: _, ...aws } = r2;
		expect(rejects(aws)).toContain("needs S3_REGION");
	});
});

describe("billing settings", () => {
	const base = { DATABASE_URL: direct };
	const stripe = {
		STRIPE_API_KEY: "rk_test_abc123",
		STRIPE_PRICE_ID: "price_abc123",
	};

	function rejects(env: Record<string, string>): string {
		const exit = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("exit");
		});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			expect(() => loadConfig({ ...base, ...env })).toThrow("exit");
			return String(error.mock.calls[0]?.[0]);
		} finally {
			exit.mockRestore();
			error.mockRestore();
		}
	}

	it("accepts neither (billing off) or both", () => {
		expect(
			loadConfig({ ...base, STRIPE_API_KEY: "", STRIPE_PRICE_ID: "" }),
		).toMatchObject({ STRIPE_API_KEY: undefined, STRIPE_PRICE_ID: undefined });
		expect(loadConfig({ ...base, ...stripe })).toMatchObject(stripe);
	});

	it("stops the boot when only one of the two is set", () => {
		expect(rejects({ STRIPE_API_KEY: stripe.STRIPE_API_KEY })).toContain(
			"set STRIPE_API_KEY and STRIPE_PRICE_ID together",
		);
	});

	// A publishable key (pk_) or a product id (prod_) in the wrong box is a common paste mistake.
	it("stops the boot on a value of the wrong kind", () => {
		expect(rejects({ ...stripe, STRIPE_API_KEY: "pk_test_abc" })).toContain(
			"rk_test_",
		);
		expect(rejects({ ...stripe, STRIPE_PRICE_ID: "prod_abc" })).toContain(
			"price_",
		);
	});
});
