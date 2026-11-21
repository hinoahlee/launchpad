import { describe, expect, it } from "vitest";
import { renderEmail } from "./render.tsx";

describe("renderEmail", () => {
	it("renders the welcome email as HTML and plain text", async () => {
		const email = await renderEmail({
			template: "welcome",
			to: "ada@example.com",
			props: { name: "Ada" },
		});

		expect(email.subject).toBe("Welcome to Launchpad");
		expect(email.html).toMatch(/^<!DOCTYPE html/);
		expect(email.html).toContain("Welcome, Ada");
		expect(email.text).toMatch(/welcome, ada/i); // headings are uppercased in plain text
		expect(email.text).not.toContain("<");
	});

	it("escapes props, so a name can't inject HTML", async () => {
		const email = await renderEmail({
			template: "welcome",
			to: "ada@example.com",
			props: { name: '<a href="https://evil.example">x</a>' },
		});

		expect(email.html).not.toContain('<a href="https://evil.example">');
		expect(email.html).toContain("&lt;a href=");
	});

	it("renders the sign-in code, keeping it out of the subject", async () => {
		const email = await renderEmail({
			template: "sign-in-code",
			to: "ada@example.com",
			props: { code: "123456", expiresInMinutes: 5 },
		});

		expect(email.subject).toBe("Your Launchpad sign-in code");
		expect(email.subject).not.toContain("123456");
		expect(email.html).toContain("123456");
		expect(email.text).toContain("123456");
		expect(email.text).toContain("5 minutes");
	});
});
