// The one interface the app sends email through (the adapter pattern): code that sends depends on this, never
// on a provider's SDK. Each provider is an adapter behind it; tests swap in the in-memory one.

// A rendered email, ready to hand to a provider. The sender address is the driver's job (its config), not
// each caller's.
export type OutgoingEmail = {
	to: string;
	subject: string;
	html: string;
	// The plain-text part: read by text-only clients and screen readers, and weighed by spam filters.
	text: string;
	// The same key means the same email: a provider that sees it twice delivers it once. The send_email job
	// passes its job id, so a retried job can't send twice.
	idempotencyKey: string;
};

export type EmailDriver = {
	// Resolves once the provider accepted the email; throws if it didn't, so the job retries.
	send: (email: OutgoingEmail, signal: AbortSignal) => Promise<void>;
};
