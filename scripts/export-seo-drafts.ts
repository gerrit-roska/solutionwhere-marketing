import { exportAllDrafts } from "../packages/core/src/seo/export-mdx";

const paths = await exportAllDrafts();
console.log("exported:", paths);
process.exit(0);
