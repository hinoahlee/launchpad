// The product's identity: the one place to rename it. Used by the header, footer, page titles and legal pages.
// The API's emails can't import it: rename `productName` in apps/api/src/lib/email/templates/ too.
export const site = {
	name: "Launchpad",
	tagline: "A production-grade app template, built step by step.",
	description:
		"A Fastify API and a React app in one container image, with Postgres, CI/CD, error tracking and security headers. It deploys to Render today, and to a VPS or AWS later.",
	repoUrl: "https://github.com/hinoahlee/launchpad",
	// Shown on the privacy policy and terms. Replace it with a real inbox someone reads before launch.
	contactEmail: "hello@example.com",
	// Bump when /privacy or /terms changes.
	legalUpdated: "November 21, 2026",
} as const;

// "Privacy policy · Launchpad": the page first, so it stays readable in a narrow browser tab.
export function pageTitle(page?: string): string {
	return page ? `${page} · ${site.name}` : site.name;
}
