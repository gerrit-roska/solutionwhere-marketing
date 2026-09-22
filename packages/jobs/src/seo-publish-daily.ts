import { destroyDb } from "@app/core";
import { runSeoPipeline } from "@app/core/seo/pipeline";

// Entrypoint for the seo-publish-daily cron job in graphed.yaml.
// Local: `npm run job:seo-publish-daily`.
// Cloud: `graphed jobs run seo-publish-daily`.
// One invocation publishes up to 3 queued keywords (docs/05 cadence).
const PUBLISHES_PER_RUN = 3;

async function main(): Promise<void> {
  try {
    for (let i = 0; i < PUBLISHES_PER_RUN; i += 1) {
      const result = await runSeoPipeline();
      console.log(
        `[${i + 1}/${PUBLISHES_PER_RUN}] ${result.status}` +
          `${result.publicUrl ? ` — ${result.publicUrl}` : ""}` +
          `${result.keyword ? ` (${result.keyword})` : ""}`,
      );
      if (result.status === "noop") break;
    }
  } finally {
    await destroyDb();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
