import { graphed } from "../packages/core/src/marketing/graphed";

const result = await graphed.tools.run(
  "getleads:contacts.search",
  {
    domains: ["bostonpublicschools.org"],
    countries: ["US"],
    jobTitles: ["registrar", "director of curriculum"],
    limit: 5,
  },
  { timeoutSeconds: 120 },
);
console.log("TYPE:", typeof result, Array.isArray(result));
const s = JSON.stringify(result);
console.log("RAW (first 800):", s.slice(0, 800));
process.exit(0);
