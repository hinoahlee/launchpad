// Code that sends email depends on this, never on a provider SDK. The sender address is the driver's config.
export type OutgoingEmail = {
	to: string;
	subject: string;
	html: string;
	text: string;
	// The provider delivers one email per key; send_email passes its job id.
	idempotencyKey: string;
};

export type SendResult = {
	// Unset when nothing reached a provider.
	providerId?: string;
};

export type EmailDriver = {
	// Throws when the provider didn't accept it, so the job retries.
	send: (email: OutgoingEmail, signal: AbortSignal) => Promise<SendResult>;
};
