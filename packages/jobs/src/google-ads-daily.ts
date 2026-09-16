import { destroyDb } from "@app/core";
import { reconcileGoogleAds } from "@app/core/ads/bootstrap";

// Google Ads reconcile (03-google-ads-execution.md). API access is
// provisioned — the GOOGLE_ADS_* secrets were set in Graphed cloud
// 2026-09-16 — so a run validates every planned mutate against the live
// account and records the plan in ads_resources. The job is intentionally
// NOT in graphed.yaml; run it as a one-off:
//   graphed dev run -- npm run job:google-ads-daily
// --apply stays a human decision made in a local shell, never in the
// manifest.

const apply = process.argv.includes("--apply");

reconcileGoogleAds(apply)
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
    if (report.planErrors.length > 0 || report.errors.length > 0) {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(destroyDb);
