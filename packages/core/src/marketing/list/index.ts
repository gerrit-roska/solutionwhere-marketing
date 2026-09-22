import { runNces } from "./nces";
import { runAesa } from "./aesa";
import { runDirectories } from "./directories";
import { runWebsiteResolution } from "./websites";
import { runGetleadsEnrichment } from "./enrich";
import { stampPriorityTiers } from "./waves";

// Nightly rotation (07 §4.2): one source per night, tracked in source_runs.
//   Sun    NCES CCD LEA universe (annual data; monthly re-run is harmless)
//   Mon    AESA directory
//   Tue    State CCR&R networks   — needs data/state-source-urls.csv (curated
//                                   by hand; module lands with that file)
//   Wed    Head Start locator     — needs the dataset export path confirmed
//   Thu-Sat Website resolution (FDE-530) → staff directories for accounts
//           due re-verification
//
// Tue/Wed log-and-skip until their curated inputs exist rather than
// pretending coverage. FORCE_SOURCE=<name> overrides the rotation for
// manual runs (e.g. `FORCE_SOURCE=nces npm run job:list-build-nightly`).

export async function run(): Promise<void> {
  await stampPriorityTiers();
  const force = process.env.FORCE_SOURCE;
  const day = new Date().getDay(); // 0 = Sunday

  const source =
    force ??
    (["nces", "aesa", "ccrr-state", "headstart", "directories", "directories", "directories"][day] as string);

  switch (source) {
    case "nces":
      await runNces();
      break;
    case "aesa":
      await runAesa();
      break;
    case "ccrr-state":
      console.log(
        "ccrr-state: data/state-source-urls.csv not curated yet — skipping (06 §2.3 lists the per-state sources).",
      );
      break;
    case "headstart":
      console.log(
        "headstart: locator export path not confirmed yet — skipping (06 §2.4; site 403s naive fetchers).",
      );
      break;
    case "websites":
      await runWebsiteResolution();
      break;
    case "enrich":
      await runGetleadsEnrichment();
      break;
    case "directories":
      // Resolve missing websites first so the crawl has something to work
      // with (FDE-530), crawl what's due, then enrich the accounts where
      // the directory yielded nothing (06 §3.5 — most district directories
      // are JS apps with no emails in the raw HTML).
      await runWebsiteResolution();
      await runDirectories();
      await runGetleadsEnrichment();
      break;
    default:
      throw new Error(`Unknown source: ${source}`);
  }
}
