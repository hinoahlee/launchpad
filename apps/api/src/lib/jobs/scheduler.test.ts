import { jobs } from "@launchpad/db";
import { createTestDb } from "@launchpad/db/testing";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createLogger } from "#lib/logger.ts";
import {
	enqueueDueRuns,
	parseSchedules,
	runKey,
	startScheduler,
} from "./scheduler.ts";
import type { Schedule } from "./schedules.ts";
import { schedules } from "./schedules.ts";

const db = createTestDb();
afterAll(() => db.$client.end());

const hourly: Schedule = {
	name: "hourly-echo",
	cron: "0 * * * *",
	type: "echo",
	payload: { message: "tick" },
};
const parsed = parseSchedules([hourly]);

const keys = async () =>
	(await db.select({ key: jobs.key }).from(jobs).orderBy(jobs.key)).map(
		(row) => row.key,
	);

describe("parseSchedules", () => {
	it("accepts every schedule the app defines", () => {
		expect(() => parseSchedules(schedules)).not.toThrow();
	});

	it("rejects an invalid cron expression", () => {
		expect(() => parseSchedules([{ ...hourly, cron: "61 * * * *" }])).toThrow();
	});

	it("rejects two schedules with the same name", () => {
		expect(() => parseSchedules([hourly, hourly])).toThrow(/duplicate/);
	});
});

describe("enqueueDueRuns", () => {
	it("queues the latest run, keyed by the time it's for", async () => {
		const now = new Date("2026-01-01T10:37:00Z");
		expect(await enqueueDueRuns(db, parsed, now)).toEqual([
			"hourly-echo:2026-01-01T10:00:00.000Z",
		]);
		const [job] = await db.select().from(jobs);
		expect(job).toMatchObject({
			type: "echo",
			payload: { message: "tick" },
			status: "queued",
		});
	});

	it("does nothing when the latest run was already queued", async () => {
		await enqueueDueRuns(db, parsed, new Date("2026-01-01T10:05:00Z"));
		expect(
			await enqueueDueRuns(db, parsed, new Date("2026-01-01T10:59:59Z")),
		).toEqual([]);
		expect(await db.$count(jobs)).toBe(1);
	});

	it("queues each run once, however many workers tick at the same moment", async () => {
		const now = new Date("2026-01-01T10:00:30Z");
		// 8 workers' schedulers at once, each on its own connection: one insert wins, the rest do nothing.
		const results = await Promise.all(
			Array.from({ length: 8 }, () => enqueueDueRuns(db, parsed, now)),
		);
		expect(results.flat()).toEqual([
			runKey("hourly-echo", new Date("2026-01-01T10:00:00Z")),
		]);
		expect(await db.$count(jobs)).toBe(1);
	});

	it("queues a new run each hour", async () => {
		for (const at of [
			"10:00:30",
			"10:30:00",
			"11:00:30",
			"11:45:00",
			"12:00:30",
		]) {
			await enqueueDueRuns(db, parsed, new Date(`2026-01-01T${at}Z`));
		}
		expect(await keys()).toEqual([
			"hourly-echo:2026-01-01T10:00:00.000Z",
			"hourly-echo:2026-01-01T11:00:00.000Z",
			"hourly-echo:2026-01-01T12:00:00.000Z",
		]);
	});

	it("catches up on the latest missed run only, not every run it missed", async () => {
		await enqueueDueRuns(db, parsed, new Date("2026-01-01T10:00:30Z"));
		// The worker was down from 10:01 until 13:20.
		await enqueueDueRuns(db, parsed, new Date("2026-01-01T13:20:00Z"));
		expect(await keys()).toEqual([
			"hourly-echo:2026-01-01T10:00:00.000Z",
			"hourly-echo:2026-01-01T13:00:00.000Z",
		]);
	});

	it("handles each schedule on its own", async () => {
		const both = parseSchedules([
			hourly,
			{ ...hourly, name: "quarterly-echo", cron: "*/15 * * * *" },
		]);
		expect(
			await enqueueDueRuns(db, both, new Date("2026-01-01T10:20:00Z")),
		).toEqual([
			"hourly-echo:2026-01-01T10:00:00.000Z",
			"quarterly-echo:2026-01-01T10:15:00.000Z",
		]);
	});
});

describe("startScheduler", () => {
	it("queues the due run on start, without waiting for the first tick", async () => {
		const scheduler = startScheduler({
			db,
			log: createLogger("silent"),
			schedules: [hourly],
			tickMs: 60_000,
		});
		try {
			await vi.waitFor(async () => expect(await db.$count(jobs)).toBe(1), {
				timeout: 3_000,
				interval: 20,
			});
		} finally {
			await scheduler.stop();
		}
	});
});
