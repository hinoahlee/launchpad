import type { ReactNode } from "react";
import { pageTitle, site } from "#lib/site.ts";

// Shared frame for /privacy and /terms. Text styles follow shadcn's typography page (plain Tailwind classes,
// no plugin). Long legal text reads best at ~65 characters a line, hence max-w-prose.
export function LegalPage({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<article className="flex max-w-prose flex-col gap-8 leading-7 [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4 [&_ul]:ml-6 [&_ul]:list-disc [&_ul]:[&>li]:mt-2">
			<title>{pageTitle(title)}</title>
			<header className="flex flex-col gap-2">
				<h1 className="scroll-m-20 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
					{title}
				</h1>
				<p className="text-sm text-muted-foreground">
					Last updated {site.legalUpdated}
				</p>
			</header>
			{children}
		</article>
	);
}

export function LegalSection({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<section className="flex flex-col gap-4">
			<h2 className="scroll-m-20 border-b pb-2 text-xl font-semibold tracking-tight sm:text-2xl">
				{title}
			</h2>
			{children}
		</section>
	);
}

export function ContactLink() {
	return <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>;
}
