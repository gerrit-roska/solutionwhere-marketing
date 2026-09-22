import { destroyDb } from "@app/core";
import { run } from "@app/core/email/waterfall";

run({ skipApify: true })
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(destroyDb);
