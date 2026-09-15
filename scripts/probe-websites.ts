import { runWebsiteResolution } from "../packages/core/src/marketing/list/websites";

// FDE-530 probe: resolve a small batch, then report. Full directories crawl
// proof is separate (scripts/probe-directories.ts).
const limit = Number(process.argv[2] ?? 10);
await runWebsiteResolution(limit);
process.exit(0);
