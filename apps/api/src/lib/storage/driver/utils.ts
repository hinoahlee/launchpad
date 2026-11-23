// `attachment` makes browsers save the file instead of rendering it: an uploaded HTML or SVG could run scripts.
// RFC 6266: an ASCII fallback name, and the exact name UTF-8 encoded.
export function attachmentDisposition(fileName: string): string {
	const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
	const encoded = encodeURIComponent(fileName).replace(
		/['()*]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
	);
	return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
