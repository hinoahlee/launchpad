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

export type SignInCodeProps = { code: string; expiresInMinutes: number };

// The code stays out of the subject and preview: those show on lock screens and in inbox lists.
export const signInCodeSubject = () => `Your ${productName} sign-in code`;

// Inline styles: many email clients (Gmail, Outlook) ignore <style> blocks and external CSS.
export function SignInCodeEmail({ code, expiresInMinutes }: SignInCodeProps) {
	return (
		<Html lang="en">
			<Head />
			<Preview>{`Enter it on the ${productName} sign-in page.`}</Preview>
			<Body style={{ backgroundColor: "#ffffff", fontFamily: "sans-serif" }}>
				<Container style={{ maxWidth: "480px", padding: "24px" }}>
					<Heading as="h1" style={{ fontSize: "20px" }}>
						Your sign-in code
					</Heading>
					<Text
						style={{
							fontFamily: "monospace",
							fontSize: "32px",
							fontWeight: "bold",
							letterSpacing: "6px",
						}}
					>
						{code}
					</Text>
					<Text>
						{`Enter this code on the ${productName} sign-in page. It works once, for ${expiresInMinutes} minutes.`}
					</Text>
					<Text style={{ color: "#6b7280" }}>
						If you didn't try to sign in, you can ignore this email: no one can
						sign in without the code.
					</Text>
				</Container>
			</Body>
		</Html>
	);
}
