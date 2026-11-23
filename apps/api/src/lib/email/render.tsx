import type { ReactElement } from "react";
import { render, toPlainText } from "react-email";
import type { EmailMessage } from "./schemas.ts";
import {
	SignInCodeEmail,
	signInCodeSubject,
} from "./templates/sign-in-code.tsx";
import { WelcomeEmail, welcomeSubject } from "./templates/welcome.tsx";

type RenderedEmail = { subject: string; html: string; text: string };

function template(message: EmailMessage): {
	subject: string;
	element: ReactElement;
} {
	// No default case: a new email fails to compile here until it has a template.
	switch (message.template) {
		case "welcome":
			return {
				subject: welcomeSubject(),
				element: <WelcomeEmail {...message.props} />,
			};
		case "sign-in-code":
			return {
				subject: signInCodeSubject(),
				element: <SignInCodeEmail {...message.props} />,
			};
	}
}

export async function renderEmail(
	message: EmailMessage,
): Promise<RenderedEmail> {
	const { subject, element } = template(message);
	const html = await render(element);
	return { subject, html, text: toPlainText(html) };
}
