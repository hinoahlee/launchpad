import { createFileRoute } from "@tanstack/react-router";
import {
	Activity,
	Boxes,
	Database,
	FileCode,
	GitBranch,
	ShieldCheck,
} from "lucide-react";
import { Button } from "#components/ui/button.tsx";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#components/ui/card.tsx";
import { ApiStatus } from "#features/status/api-status.tsx";
import { pageTitle, site } from "#lib/site.ts";

// The file's path is the URL: routes/index.tsx → "/". Vite regenerates src/routeTree.gen.ts from this folder.
export const Route = createFileRoute("/")({
	component: Home,
});

const features = [
	{
		icon: FileCode,
		title: "One typed contract",
		description:
			"Zod schemas in a shared package validate every request and type both the API and the web app.",
	},
	{
		icon: Boxes,
		title: "One image, any platform",
		description:
			"The API and the web app ship in one container image that runs on Render, a VPS or AWS.",
	},
	{
		icon: Database,
		title: "Postgres with migrations",
		description:
			"Drizzle schema, reviewed SQL migrations, and tests against a real database.",
	},
	{
		icon: GitBranch,
		title: "CI/CD on every merge",
		description:
			"Lint, typecheck, tests and build on each PR. Main deploys the exact image CI built.",
	},
	{
		icon: ShieldCheck,
		title: "Secure by default",
		description:
			"A strict Content Security Policy, HSTS and rate limiting on the API.",
	},
	{
		icon: Activity,
		title: "Observable",
		description:
			"Structured logs, health probes and error tracking in the browser and on the server.",
	},
];

function Home() {
	return (
		<div className="flex flex-col gap-12 sm:gap-16">
			<title>{pageTitle()}</title>
			{/* Phone first: stacked and left-aligned; side-by-side buttons from `sm` up. */}
			<section className="flex flex-col gap-6 pt-4 sm:pt-10">
				<div className="flex flex-col gap-3">
					<h1 className="scroll-m-20 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
						{site.name}
					</h1>
					<p className="text-lg text-balance sm:text-xl">{site.tagline}</p>
					<p className="max-w-prose text-muted-foreground">
						{site.description}
					</p>
				</div>
				<div className="flex flex-col gap-3 sm:flex-row">
					{/* A link that looks like a button: Base UI renders the <a>, `nativeButton={false}` drops button
					    semantics so it stays a real link (open in new tab, etc.). */}
					<Button
						size="lg"
						nativeButton={false}
						render={<a href={site.repoUrl} />}
					>
						View on GitHub
					</Button>
					<Button
						variant="outline"
						size="lg"
						nativeButton={false}
						render={<a href={`${site.repoUrl}/tree/main/docs/roadmap`} />}
					>
						Read the roadmap
					</Button>
				</div>
			</section>

			<section className="flex flex-col gap-4" aria-labelledby="features">
				<h2
					id="features"
					className="scroll-m-20 text-2xl font-semibold tracking-tight"
				>
					What's inside
				</h2>
				{/* One column on phones, two from `sm` (640px), three from `lg` (1024px). */}
				<ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{features.map(({ icon: Icon, title, description }) => (
						<li key={title}>
							<Card className="h-full">
								<CardHeader>
									<Icon
										className="mb-2 size-5 text-muted-foreground"
										aria-hidden
									/>
									<CardTitle>{title}</CardTitle>
									<CardDescription>{description}</CardDescription>
								</CardHeader>
							</Card>
						</li>
					))}
				</ul>
			</section>

			<section className="flex flex-col gap-4" aria-labelledby="status">
				<h2
					id="status"
					className="scroll-m-20 text-2xl font-semibold tracking-tight"
				>
					Status
				</h2>
				<ApiStatus />
			</section>
		</div>
	);
}
