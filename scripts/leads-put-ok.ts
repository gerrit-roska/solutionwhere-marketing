import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { presignGet, putText } from "../packages/core/src/marketing/storage";

const snap = JSON.parse(
  readFileSync(join(process.cwd(), "data/leads-waterfall/snapshot.json"), "utf8"),
) as { leads: Array<{ mv?: string }> };
const ok = snap.leads.filter((l) => l.mv === "ok");
const key = `leads/waterfall-ok-${Date.now()}.json`;
await putText(key, JSON.stringify(ok), "application/json");
const url = await presignGet(key, 3600);
writeFileSync(join(process.cwd(), "data/leads-waterfall/presign.txt"), url);
console.log(JSON.stringify({ stored: key, count: ok.length }));
