import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ThemeToggle } from "#components/layout/theme-toggle.tsx";

// The frame around every page: header, content, footer. Phone first: full width with a 1rem gutter, wider
// and centered from the `sm` breakpoint up. `env(safe-area-inset-*)` keeps content clear of a phone's notch.
export function PageLayout({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-svh flex-col">
			<header className="sticky top-0 z-40 border-b bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur">
				<div className="mx-auto flex h-14 max-w-5xl items-center justify-between pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] sm:px-6">
					<Link
						to="/"
						className="-ml-2 rounded-md px-2 py-2 font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
					>
						launchpad
					</Link>
					<ThemeToggle />
				</div>
			</header>
			<main className="mx-auto flex w-full max-w-2xl flex-1 flex-col pt-6 pr-[max(1rem,env(safe-area-inset-right))] pb-10 pl-[max(1rem,env(safe-area-inset-left))] sm:px-6 sm:pt-10">
				{children}
			</main>
			<footer className="border-t pb-[env(safe-area-inset-bottom)] text-sm text-muted-foreground">
				<div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
					© {new Date().getFullYear()} launchpad
				</div>
			</footer>
		</div>
	);
}
