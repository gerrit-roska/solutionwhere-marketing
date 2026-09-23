import { destroyDb } from "../packages/core/src/db";
import { runCreativeFactory } from "../packages/core/src/creative/factory";

const creativeId = process.argv[2] ?? "P1-A8-v1";

runCreativeFactory({ only: [creativeId], maxStatics: 1, maxVideos: 0 })
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length > 0) process.exitCode = 1;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(destroyDb);
