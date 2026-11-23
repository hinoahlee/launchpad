// Client-side refusals; API refusals arrive as ApiError.
export class UploadError extends Error {
	readonly reason: "too_large" | "bucket_refused";

	constructor(reason: "too_large" | "bucket_refused") {
		super(`upload failed: ${reason}`);
		this.reason = reason;
		this.name = "UploadError";
	}
}
