import { PRODUCT_NAME } from "@launchpad/shared";
import {
	Body,
	Container,
	Head,
	Heading,
	Html,
	Preview,
	Text,
} from "react-email";

type SignInCodeProps = { code: string; expiresInMinutes: number };

// The code stays out of the subject and preview, which show on lock screens.
export const signInCodeSubject = () => `Your ${PRODUCT_NAME} sign-in code`;

// Inline styles: many email clients ignore <style> blocks.
export function SignInCodeEmail({ code, expiresInMinutes }: SignInCodeProps) {
	return (
		<Html lang="en">
			<Head />
			<Preview>{`Enter it on the ${PRODUCT_NAME} sign-in page.`}</Preview>
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
						{`Enter this code on the ${PRODUCT_NAME} sign-in page. It works once, for ${expiresInMinutes} minutes.`}
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
