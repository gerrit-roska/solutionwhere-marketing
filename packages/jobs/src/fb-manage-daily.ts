import { destroyDb } from "@app/core";
import { runFbManageDaily } from "@app/core/fb/manage";

// Daily Meta pruning loop (04 §7, 07 §4.10): kill/scale/rotate/flip rules
// against warehouse performance, every mutation ledgered in fb_actions,
// Slack summary, token-expiry alert at day 50. Read-only reporting unless
// --apply is passed explicitly from a shell — never via env, never from the
// manifest (the graphed.yaml block stays paused). The account-wide 30%
// daily budget-increase cap is enforced in the planner.

const apply = process.argv.includes("--apply");

runFbManageDaily({ apply })
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
