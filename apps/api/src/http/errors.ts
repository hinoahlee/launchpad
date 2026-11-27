// An error whose status is ours to send. The error handler passes on only this status and Fastify's own (FST_*
// codes): other libraries put their upstream's status on `statusCode` too (a Stripe 401 is our 500, not the
// caller's 401).
export class HttpError extends Error {
	readonly statusCode: number;

	constructor(statusCode: number, message: string) {
		super(message);
		this.name = "HttpError";
		this.statusCode = statusCode;
	}
}
