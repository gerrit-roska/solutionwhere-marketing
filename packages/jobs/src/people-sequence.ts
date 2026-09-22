import { destroyDb } from "@app/core";
import { run } from "@app/core/email/people-sequence";

run({ wave: "next", skipInstantly: !process.env.INSTANTLY_API_KEY })
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(destroyDb);
