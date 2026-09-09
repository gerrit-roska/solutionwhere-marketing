import { destroyDb } from "@app/core";
import { run } from "@app/core/marketing/keywords";

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(destroyDb);
