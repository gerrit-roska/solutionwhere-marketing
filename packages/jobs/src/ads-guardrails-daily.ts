import { destroyDb } from "@app/core";
import { runAdsGuardrails } from "@app/core/ads/guardrails";

// Ads watchdog (07 §4.8): warehouse checks for the 03/04 failure modes,
// guardrail_alerts + Slack on fire/resolve, and wasted search terms mined
// into proposed negatives on NEG - Auto Guardrails. Mutations are
// validate-only unless --apply is passed explicitly from a shell — never
// via env, never from the manifest (the graphed.yaml block stays paused).

const apply = process.argv.includes("--apply");

runAdsGuardrails(apply)
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
    if (report.errors.length > 0) {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(destroyDb);
