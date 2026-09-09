import { destroyDb } from "@app/core";
import { run } from "@app/core/marketing/aeo";

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(destroyDb);
