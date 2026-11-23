import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ContactLink,
	LegalPage,
	LegalSection,
} from "#features/legal/components/legal-page.tsx";
import { site } from "#lib/site/constants.ts";

// Starting terms. Not legal advice.
export const Route = createFileRoute("/terms")({
	component: Terms,
});

function Terms() {
	return (
		<LegalPage title="Terms of service">
			<p>
				By using {site.name}, you agree to these terms. If you don't agree,
				please don't use it.
			</p>

			<LegalSection title="Using the service">
				<ul>
					<li>Use {site.name} only for lawful purposes.</li>
					<li>
						Don't try to break it, overload it, or get around its security or
						rate limits.
					</li>
				</ul>
			</LegalSection>

			<LegalSection title="Your account">
				<ul>
					<li>
						Keep access to your account to yourself: anyone who can read your
						email or use your Google account can sign in as you.
					</li>
					<li>
						You can delete your account at any time from your account page.
					</li>
					<li>We may suspend or delete accounts that break these terms.</li>
				</ul>
			</LegalSection>

			<LegalSection title="No warranty">
				<p>
					{site.name} is provided "as is", without warranties of any kind. It
					may change, be unavailable, or stop running at any time.
				</p>
			</LegalSection>

			<LegalSection title="Limitation of liability">
				<p>
					To the extent the law allows, {site.name} and its authors aren't
					liable for any damages from using or not being able to use the
					service.
				</p>
			</LegalSection>

			<LegalSection title="Privacy">
				<p>
					How we handle data is described in the{" "}
					<Link to="/privacy">privacy policy</Link>.
				</p>
			</LegalSection>

			<LegalSection title="Changes">
				<p>
					We may update these terms. The date at the top shows when they last
					changed. Using {site.name} after a change means you accept the new
					terms.
				</p>
			</LegalSection>

			<LegalSection title="Contact">
				<p>
					Questions: <ContactLink />
				</p>
			</LegalSection>
		</LegalPage>
	);
}
