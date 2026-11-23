import type { EmailDriver, OutgoingEmail } from "../types.ts";

type MemoryDriver = EmailDriver & {
	sent: OutgoingEmail[];
};

export function createMemoryDriver(): MemoryDriver {
	const sent: OutgoingEmail[] = [];
	return {
		sent,
		async send(email) {
			sent.push(email);
			return {};
		},
	};
}
