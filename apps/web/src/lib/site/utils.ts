import { site } from "./constants.ts";

// "Privacy policy · Launchpad": the page first, so it stays readable in a narrow tab.
export function pageTitle(page?: string): string {
	return page ? `${page} · ${site.name}` : site.name;
}
