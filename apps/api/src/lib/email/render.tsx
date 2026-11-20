import type { ReactElement } from "react";
import { render, toPlainText } from "react-email";
import type { EmailMessage } from "./messages.ts";
import { WelcomeEmail, welcomeSubject } from "./templates/welcome.tsx";

export type RenderedEmail = { subject: string; html: string; text: string };

function template(message: EmailMessage): {
	subject: string;
	element: ReactElement;
} {
	// No default case: a new member of emailMessage fails to compile here until it has a template.
	switch (message.template) {
		case "welcome":
			return {
				subject: welcomeSubject(),
				element: <WelcomeEmail {...message.props} />,
			};
	}
}

// The HTML part, and a plain-text part derived from it, so the two can't drift apart.
export async function renderEmail(
	message: EmailMessage,
): Promise<RenderedEmail> {
	const { subject, element } = template(message);
	const html = await render(element);
	return { subject, html, text: toPlainText(html) };
}
