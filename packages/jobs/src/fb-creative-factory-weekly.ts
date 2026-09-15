import { destroyDb } from "@app/core";
import {
  loadCreativeConfig,
  runCreativeFactory,
} from "@app/core/creative/factory";

// The Andromeda creative factory (04 §5, 07 §4.10). Weekly full run works
// the whole matrix; `--review` produces only the small first-review batch
// from clients/solutionwhere/creative/config.json (3 videos + 2 statics).
// Billed per render: retries stay 0 in the manifest.

const args = process.argv.slice(2);
const review = args.includes("--review");
const flagValue = (name: string): number | undefined => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? Number(args[index + 1]) : undefined;
};

const options = review
  ? (() => {
      const batch = loadCreativeConfig().reviewBatch;
      return { maxVideos: batch.videos, maxStatics: batch.statics };
    })()
  : {
      maxVideos: flagValue("max-videos"),
      maxStatics: flagValue("max-statics"),
    };

runCreativeFactory(options)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length > 0) process.exitCode = 1;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(destroyDb);
