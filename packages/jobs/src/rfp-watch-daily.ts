import { destroyDb } from "@app/core";
import { run } from "@app/core/marketing/rfp";

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(destroyDb);
