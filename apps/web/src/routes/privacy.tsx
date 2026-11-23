import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ContactLink,
	LegalPage,
	LegalSection,
} from "#features/legal/components/legal-page.tsx";
import { site } from "#lib/site/constants.ts";

// A starting policy matching what the app collects: accounts, sign-in emails, a session cookie, uploaded files,
// billing. Update it (and site.legalUpdated) when the app stores something new. Not legal advice.
export const Route = createFileRoute("/privacy")({
	component: Privacy,
});

function Privacy() {
	return (
		<LegalPage title="Privacy policy">
			<p>
				This policy explains what data {site.name} collects, why, and how to
				delete it.
			</p>

			<LegalSection title="What we collect">
				<ul>
					<li>
						<strong className="font-medium">Your account.</strong> Your email
						address, and if you sign in with Google, the name and profile
						picture Google shares. We also note how you last signed in (Google
						or an email code).
					</li>
					<li>
						<strong className="font-medium">Your sessions.</strong> For each
						device you sign in on: when you signed in, when it was last active,
						its IP address and browser. You can see and end them on your account
						page.
					</li>
					<li>
						<strong className="font-medium">Sign-in emails.</strong> To send you
						a sign-in code, we keep the email (address and code) in a queue
						until it's sent. If an address bounces or marks our email as spam,
						we record that so we never email it again.
					</li>
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
			</LegalSection>

			<LegalSection title="Cookies">
				<p>
					When you sign in, {site.name} sets one cookie that keeps you signed
					in. It's needed for the app to work, so there's no banner to accept
					it. {site.name} uses no analytics, advertising or tracking cookies.
				</p>
			</LegalSection>

			<LegalSection title="Who processes it">
				<p>
					{site.name} runs on Render (hosting and database), behind Cloudflare
					(network and security). Resend sends our emails, Google handles "Sign
					in with Google", and Sentry receives error reports. They handle data
					only to provide those services. Your data isn't sold or shared with
					anyone else.
				</p>
			</LegalSection>

			<LegalSection title="How long we keep it">
				<ul>
					<li>
						Your account: until you delete it. A session ends when you sign out,
						end it from your account page, or after 7 days without use.
					</li>
					<li>
						Sent emails leave the queue after 7 days; one that failed to send
						stays until we've looked into why. An address that bounced or
						complained stays on our do-not-email list.
					</li>
					<li>
						Logs, error reports and database backups are deleted automatically
						after the retention period of the service that holds them.
					</li>
				</ul>
			</LegalSection>

			<LegalSection title="Deleting your account">
				<p>
					You can delete your account any time from your{" "}
					<Link to="/account">account page</Link>. Your account, its sign-in
					methods and every session are deleted at once. What remains is listed
					above: queued emails until they expire, the do-not-email list, and
					backups until they age out.
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
