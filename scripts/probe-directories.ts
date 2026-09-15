import { runDirectories } from "../packages/core/src/marketing/list/directories";

// FDE-530 proof: crawl staff directories for the accounts the website
// resolver just resolved (they are the only website-bearing, due rows).
await runDirectories();
process.exit(0);
