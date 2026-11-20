import { createDb } from "@launchpad/db";

// The e2e server's database: its own, on the Postgres from `pnpm db:up` (CI runs the same server). Not
// `launchpad` (your dev data) and not `launchpad_test` (Vitest wipes it at the start of `pnpm test`, which may run
// at the same time).
export const E2E_DATABASE_URL =
	"postgres://launchpad:launchpad@localhost:5433/launchpad_e2e";

// The sign-in code emailed to `email`, read from the `send_email` job the API queued. No worker runs during e2e,
// so the job waits in the table (the outbox) and nothing is sent. Polls: the job is queued inside the request
// that the page's click started.
export async function sentSignInCode(email: string): Promise<string> {
	const db = createDb(E2E_DATABASE_URL);
	try {
		for (let tries = 0; tries < 50; tries++) {
			const [job] = await db.$client<{ code: string }[]>`
				select payload->'props'->>'code' as code from jobs
				where type = 'send_email' and payload->>'template' = 'sign-in-code' and payload->>'to' = ${email}
				order by created_at desc limit 1`;
			if (job) return job.code;
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		throw new Error(`no sign-in code was queued for ${email}`);
	} finally {
		await db.$client.end();
	}
}
