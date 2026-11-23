export const UPLOAD_URL_TTL_MS = 15 * 60 * 1000;
// Cleanup that must run after every upload URL already handed out has expired: a PUT through one would bring
// a deleted object back.
export const AFTER_UPLOAD_URLS_EXPIRE_MS = UPLOAD_URL_TTL_MS + 5 * 60 * 1000;
export const DOWNLOAD_URL_TTL_MS = 5 * 60 * 1000;
