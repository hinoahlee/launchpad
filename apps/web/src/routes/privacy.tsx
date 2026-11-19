import { createFileRoute } from "@tanstack/react-router";
import {
	ContactLink,
	LegalPage,
	LegalSection,
} from "#features/legal/legal-page.tsx";
import { site } from "#lib/site.ts";

// A starting policy that matches what the app collects today: no accounts, no cookies. Each phase that stores
// something new (auth, email, files, billing) updates this page and bumps site.legalUpdated. Not legal advice.
export const Route = createFileRoute("/privacy")({
	component: Privacy,
});

function Privacy() {
	return (
		<LegalPage title="Privacy policy">
			<p>
				This policy explains what data {site.name} collects and why. Today that
				is very little: there are no accounts, and nothing you type is stored.
			</p>

			<LegalSection title="What we collect">
				<ul>
					<li>
						<strong className="font-medium">Server logs.</strong> Each request
						records your IP address, the page or API path, the time and the
						result. They are used for security, rate limiting and debugging.
					</li>
					<li>
						<strong className="font-medium">Error reports.</strong> If the app
						breaks in your browser, a report goes to Sentry: the error, the
						page, and your browser and operating system. It doesn't include your
						name, cookies or form input.
					</li>
					<li>
						<strong className="font-medium">Your theme choice.</strong> Light or
						dark is saved in your browser only and never sent to us.
					</li>
				</ul>
				<p>
					{site.name} sets no cookies and uses no analytics, advertising or
					tracking.
				</p>
			</LegalSection>

			<LegalSection title="Who processes it">
				<p>
					{site.name} runs on Render (hosting and database), behind Cloudflare
					(network and security), and reports errors to Sentry. They handle data
					only to provide those services. Your data isn't sold or shared with
					anyone else.
				</p>
			</LegalSection>

			<LegalSection title="How long we keep it">
				<p>
					Logs and error reports are deleted automatically after the retention
					period of the service that holds them.
				</p>
			</LegalSection>

			<LegalSection title="Changes">
				<p>
					When this policy changes, the date at the top changes too. Significant
					changes will be announced in the app.
				</p>
			</LegalSection>

			<LegalSection title="Contact">
				<p>
					Questions or requests: <ContactLink />
				</p>
			</LegalSection>
		</LegalPage>
	);
}
