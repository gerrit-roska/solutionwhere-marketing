import { destroyDb } from "@app/core";
import { runFbUploadDrafts } from "@app/core/fb/upload";

// Weekly Meta draft upload (04 §6, 07 §4.10): approved fb_creatives become
// PAUSED draft ads in the CAMP 01 module ad sets. Dry-run (reads only)
// unless --apply is passed explicitly from a shell — never via env, never
// from the manifest (the graphed.yaml block stays paused). Nothing is ever
// created ENABLED; the run stops on the first API error.

const apply = process.argv.includes("--apply");

runFbUploadDrafts({ apply })
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
