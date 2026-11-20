import {
	Body,
	Container,
	Head,
	Heading,
	Html,
	Preview,
	Text,
} from "react-email";

// Keep in step with `site.name` in apps/web/src/lib/site.ts.
const productName = "Launchpad";

export type WelcomeProps = { name: string };

export const welcomeSubject = () => `Welcome to ${productName}`;

// Inline styles: many email clients (Gmail, Outlook) ignore <style> blocks and external CSS.
export function WelcomeEmail({ name }: WelcomeProps) {
	return (
		<Html lang="en">
			<Head />
			{/* The grey line inbox lists show after the subject. */}
			<Preview>Your account is ready.</Preview>
			<Body style={{ backgroundColor: "#ffffff", fontFamily: "sans-serif" }}>
				<Container style={{ maxWidth: "480px", padding: "24px" }}>
					{/* One string per element: `Welcome, {name}` would split into two text nodes with an
					    `<!-- -->` marker between them. */}
					<Heading as="h1" style={{ fontSize: "20px" }}>
						{`Welcome, ${name}`}
					</Heading>
					<Text>
						{`Your ${productName} account is ready. Reply to this email if you have any questions.`}
					</Text>
				</Container>
			</Body>
		</Html>
	);
}
