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

type WelcomeProps = { name: string };

export const welcomeSubject = () => `Welcome to ${PRODUCT_NAME}`;

// Inline styles: many email clients ignore <style> blocks.
export function WelcomeEmail({ name }: WelcomeProps) {
	return (
		<Html lang="en">
			<Head />
			<Preview>Your account is ready.</Preview>
			<Body style={{ backgroundColor: "#ffffff", fontFamily: "sans-serif" }}>
				<Container style={{ maxWidth: "480px", padding: "24px" }}>
					<Heading as="h1" style={{ fontSize: "20px" }}>
						{`Welcome, ${name}`}
					</Heading>
					<Text>
						{`Your ${PRODUCT_NAME} account is ready. Reply to this email if you have any questions.`}
					</Text>
				</Container>
			</Body>
		</Html>
	);
}
