export class ResendError extends Error {
	override name = "ResendError";
	readonly status: number;
	// Resend's error name, e.g. validation_error, rate_limit_exceeded.
	readonly code: string | undefined;
	constructor(status: number, code: string | undefined, message: string) {
		super(message);
		this.status = status;
		this.code = code;
	}
}
