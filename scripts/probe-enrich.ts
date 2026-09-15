import { runGetleadsEnrichment } from "../packages/core/src/marketing/list/enrich";

const limit = Number(process.argv[2] ?? 10);
await runGetleadsEnrichment(limit);
process.exit(0);
