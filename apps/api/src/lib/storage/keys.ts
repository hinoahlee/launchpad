// Where objects live in the bucket: organizations/<organizationId>/<random uuid>.
export const organizationPrefix = (organizationId: string) =>
	`organizations/${organizationId}/`;

// Never derived from the file name, which may hold anything.
export function storageKey(organizationId: string): string {
	return `${organizationPrefix(organizationId)}${crypto.randomUUID()}`;
}
