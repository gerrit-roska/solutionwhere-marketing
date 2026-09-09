import { destroyDb } from "@app/core";
import { run } from "@app/core/marketing/verify";

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(destroyDb);
