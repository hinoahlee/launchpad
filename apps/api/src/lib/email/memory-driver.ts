import type { EmailDriver, OutgoingEmail } from "./driver.ts";

export type MemoryDriver = EmailDriver & {
	// Every accepted email, oldest first. Tests assert on it.
	sent: OutgoingEmail[];
};

// Keeps emails in an array instead of sending them. Like a real provider, it accepts a repeated
// idempotency key once, so a test can prove a retry doesn't send twice.
export function createMemoryDriver(): MemoryDriver {
	const sent: OutgoingEmail[] = [];
	return {
		sent,
		async send(email) {
			if (sent.some((e) => e.idempotencyKey === email.idempotencyKey)) return;
			sent.push(email);
		},
	};
}
