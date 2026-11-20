import { emptyDatabase } from "@launchpad/db/testing";

// Run by playwright.config.ts before the server starts: `node support/empty-database.ts <url>`. Every e2e run
// starts from an empty launchpad_e2e (no rows left by the last run), which the server's migrate step then
// fills with tables. Refuses any database not named *_test or *_e2e.
const url = process.argv[2];
if (!url) throw new Error("usage: node empty-database.ts <database url>");
await emptyDatabase(url);
