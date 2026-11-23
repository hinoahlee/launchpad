// Routes and jobs reach the bucket only through this interface: S3 adapter in production, memory in tests.

export type PresignedUpload = {
	url: string;
	// The browser must send exactly these: the signature covers them.
	headers: Record<string, string>;
	expiresAt: Date;
};

export type PresignedDownload = { url: string; expiresAt: Date };

export type StorageDriver = {
	// Scheme + host the browser uploads to; the CSP's connect-src allows it.
	origin: string;
	presignUpload(input: {
		key: string;
		contentType: string;
		sizeBytes: number;
	}): Promise<PresignedUpload>;
	presignDownload(input: {
		key: string;
		fileName: string;
	}): Promise<PresignedDownload>;
	// null: no object at `key`.
	sizeOf(key: string): Promise<number | null>;
	// No error if already gone.
	delete(key: string): Promise<void>;
	// Returns how many objects it deleted.
	deletePrefix(prefix: string): Promise<number>;
};
