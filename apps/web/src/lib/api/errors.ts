// `code`: our `error` ("not_found"...) or Better Auth's `code` ("INVALID_OTP"...).
export class ApiError extends Error {
	readonly status: number;
	readonly code: string;
	readonly requestId: string | undefined;

	constructor(status: number, code: string, requestId: string | undefined) {
		super(`API ${status}: ${code}`);
		this.name = "ApiError";
		this.status = status;
		this.code = code;
		this.requestId = requestId;
	}
}
