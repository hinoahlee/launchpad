import { createDb } from "@launchpad/db";

// Its own database: not your dev data, and not launchpad_test (which `pnpm test` wipes, maybe concurrently).
export const E2E_DATABASE_URL =
	"postgres://launchpad:launchpad@localhost:5433/launchpad_e2e";

// Read from the queued send_email job (no worker runs in e2e). Polls: the click queues it asynchronously.
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

// Pretends every session of `email` started `minutes` ago (actions that need a recent sign-in refuse them).
export async function ageSessions(email: string, minutes: number) {
	const db = createDb(E2E_DATABASE_URL);
	try {
		await db.$client`
			update sessions set created_at = now() - make_interval(mins => ${minutes})
			where user_id = (select id from users where email = ${email})`;
	} finally {
		await db.$client.end();
	}
}

// Whether an account exists for `email`.
export async function userExists(email: string): Promise<boolean> {
	const db = createDb(E2E_DATABASE_URL);
	try {
		const rows = await db.$client`select 1 from users where email = ${email}`;
		return rows.length > 0;
	} finally {
		await db.$client.end();
	}
}
