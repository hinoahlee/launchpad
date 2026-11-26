import { PRODUCT_NAME } from "@launchpad/shared";

export const site = {
	name: PRODUCT_NAME,
	tagline: "A production-ready app template.",
	description:
		"A Fastify API and a React app in one container image, with Postgres, CI/CD, error tracking and security headers. The same image runs on Render, a VPS or AWS.",
	repoUrl: "https://github.com/hinoahlee/launchpad",
	// Replace with a real inbox before launch.
	contactEmail: "hello@example.com",
	// Bump when /privacy or /terms changes.
	legalUpdated: "November 26, 2026",
} as const;
