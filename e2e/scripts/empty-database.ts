import { emptyDatabase } from "@launchpad/db/testing";

// `node scripts/empty-database.ts <url>`, before the server starts: every run begins empty. Refuses any
// database not named *_test or *_e2e.
const url = process.argv[2];
if (!url) throw new Error("usage: node empty-database.ts <database url>");
await emptyDatabase(url);
