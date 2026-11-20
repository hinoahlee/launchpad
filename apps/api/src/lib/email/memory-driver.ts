import type { EmailDriver, OutgoingEmail } from "./driver.ts";

export type MemoryDriver = EmailDriver & {
	// Every email handed to it, oldest first. Tests assert on it.
	sent: OutgoingEmail[];
};

// Keeps emails in an array instead of sending them. It doesn't mimic a provider's idempotency: that's the
// provider's guarantee, and our part (a stable key) is asserted directly on `sent`.
export function createMemoryDriver(): MemoryDriver {
	const sent: OutgoingEmail[] = [];
	return {
		sent,
		async send(email) {
			sent.push(email);
		},
	};
}
