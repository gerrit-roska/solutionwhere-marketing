import { destroyDb } from "@app/core";
import { reconcileGoogleAds } from "@app/core/ads/bootstrap";

// Google Ads reconcile (03-google-ads-execution.md). Always validate-only
// from cron — the account has no developer token yet (FDE-526), so this job
// is intentionally NOT in graphed.yaml. Run it as a one-off:
//   graphed dev run -- npm run job:google-ads-daily
// With credentials present it validates every planned mutate against the API
// and records the plan in ads_resources. --apply stays a human decision made
// in a local shell, never in the manifest.

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
