import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ModeToggle } from "#components/layout/mode-toggle.tsx";
import { UserMenu } from "#features/auth/user-menu.tsx";
import { site } from "#lib/site.ts";

// Footer links: 44px tall on touch screens (`pointer-coarse:`), so a thumb can't miss them.
const footerLink =
	"inline-flex items-center rounded-md underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11";

// The frame around every page: header, content, footer. Phone first: full width with a 1rem gutter, wider
// and centered from the `sm` breakpoint up. `env(safe-area-inset-*)` keeps content clear of a phone's notch.
export function PageLayout({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-svh flex-col">
			<header className="sticky top-0 z-40 border-b bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur">
				<div className="mx-auto flex h-14 max-w-5xl items-center justify-between pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] sm:px-6">
					<Link
						to="/"
						className="-ml-2 inline-flex items-center rounded-md px-2 py-2 font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
					>
						{site.name}
					</Link>
					<div className="flex items-center gap-2">
						<UserMenu />
						<ModeToggle />
					</div>
				</div>
			</header>
			<main className="mx-auto flex w-full max-w-5xl flex-1 flex-col pt-6 pr-[max(1rem,env(safe-area-inset-right))] pb-12 pl-[max(1rem,env(safe-area-inset-left))] sm:px-6 sm:pt-10">
				{children}
			</main>
			<footer className="border-t pb-[env(safe-area-inset-bottom)] text-sm text-muted-foreground">
				<div className="mx-auto flex max-w-5xl flex-col gap-2 pr-[max(1rem,env(safe-area-inset-right))] py-4 pl-[max(1rem,env(safe-area-inset-left))] sm:flex-row sm:items-center sm:justify-between sm:px-6">
					<p>
						© {new Date().getFullYear()} {site.name}
					</p>
					<nav aria-label="Legal" className="-ml-1 flex flex-wrap gap-x-4">
						<Link to="/privacy" className={`${footerLink} px-1`}>
							Privacy
						</Link>
						<Link to="/terms" className={`${footerLink} px-1`}>
							Terms
						</Link>
						<a
							href={`mailto:${site.contactEmail}`}
							className={`${footerLink} px-1`}
						>
							Contact
						</a>
					</nav>
				</div>
			</footer>
		</div>
	);
}
