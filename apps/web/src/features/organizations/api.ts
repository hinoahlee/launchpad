import {
	activeMemberResponseSchema,
	type CreateOrganizationRequest,
	organizationListResponseSchema,
	organizationSchema,
	type SetActiveOrganizationRequest,
} from "@launchpad/shared";
import { queryOptions } from "@tanstack/react-query";
import { api } from "#lib/api.ts";

// Every query about organizations starts with this key, so one invalidation refreshes them all after a switch.
export const organizationsKey = ["organizations"] as const;

// The organizations the signed-in user belongs to (Better Auth's organization plugin).
export const organizationsQuery = queryOptions({
	queryKey: [...organizationsKey, "list"],
	queryFn: ({ signal }) =>
		api("/auth/organization/list", organizationListResponseSchema, {
			signal,
		}),
});

// Your membership in the active organization: your role there.
export const activeMemberQuery = queryOptions({
	queryKey: [...organizationsKey, "active-member"],
	queryFn: ({ signal }) =>
		api("/auth/organization/get-active-member", activeMemberResponseSchema, {
			signal,
		}),
});

// Better Auth requires a unique slug. People never see it, so it's the name made URL-safe plus random characters:
// two "Acme"s don't collide.
export function makeSlug(name: string): string {
	const base = name
		.normalize("NFKD")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);
	const suffix = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
	return base ? `${base}-${suffix}` : suffix;
}

// Creates an organization you own; it becomes this session's active organization.
export function createOrganization(name: string) {
	const request: CreateOrganizationRequest = {
		name: name.trim(),
		slug: makeSlug(name),
	};
	return api("/auth/organization/create", organizationSchema, {
		method: "POST",
		json: request,
	});
}

// Switches this session (this device only) to another of your organizations.
export function setActiveOrganization(organizationId: string) {
	const request: SetActiveOrganizationRequest = { organizationId };
	return api("/auth/organization/set-active", organizationSchema, {
		method: "POST",
		json: request,
	});
}
