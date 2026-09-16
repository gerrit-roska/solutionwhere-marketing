import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { projectRoot } from "../packages/core/src/config";
import { getDb, destroyDb } from "../packages/core/src/db";
import { getBytes, presignGet, putBytes, putText } from "../packages/core/src/marketing/storage";
import { renderImage } from "../packages/core/src/creative/kie";
import { loadMatrix, loadCreativeConfig } from "../packages/core/src/creative/factory";

// Meeting batch v3 (2026-09-16): the top three angle variations (A1 time
// cost, A2 compliance/audit, A3 peer proof — 04 §4 order) for the FIRST ad
// set of CAMP 01, AS 01 | Broad - PD (04 §6) → persona P1, module pd.
// Differences vs v2: the official Solutionwhere logo is an img2img input
// alongside the product screenshot (mark must render exactly: red circle +
// white S + black lowercase wordmark; logo background may adapt), and no
// URL in the creative (if one ever appears it is solutionwhere.com, never
// home.solutionwhere.com). Logo source is the branch-proof copy, not the
// worktree path.

const DATE = "2026-09-16";
const DESKTOP = join(homedir(), "Desktop/solutionwhere-creatives/2026-09-16");
const LOGO_LOCAL =
  "/Users/gerritroska/.cursor/projects/Users-gerritroska-Dev-graphed-clients-solutionwhere-marketing/assets/Screenshot_2026-09-16_at_4.33.03_PM-fe9a8b78-264a-47af-aa90-69b7a12cac0c.jpg";

const CELLS = [
  {
    creative_id: "P1-A1-v3",
    angle: "A1",
    headline: "Six weeks back every fall",
    primaryText:
      "Registration season shouldn't cost your team six weeks. One platform for PD registration — 80% less admin.",
    description: "See it in 20 minutes",
  },
  {
    creative_id: "P1-A2-v3",
    angle: "A2",
    headline: "Act 48 hours, one click away",
    primaryText:
      "When PDE asks for Act 48 hours, the answer should be a button. Reporting on demand, since 1996.",
    description: "See it in 20 minutes",
  },
  {
    creative_id: "P1-A3-v3",
    angle: "A3",
    headline: "Lyons Township runs PD on this",
    primaryText:
      "Lyons Township has run PD registration on Solutionwhere for years. Same company since 1996.",
    description: "See it in 20 minutes",
  },
];

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download ${response.status}: ${url.slice(0, 120)}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function main(): Promise<void> {
  const root = projectRoot();
  const matrix = loadMatrix(root);
  const config = loadCreativeConfig(root);
  const db = getDb();
  mkdirSync(DESKTOP, { recursive: true });
  const persona = matrix.personas.P1;
  const landing = `${matrix.landingBase}${persona.landing}`;

  const existing = await db
    .selectFrom("fb_creatives")
    .select(["creative_id", "headline"])
    .execute();
  const usedHeadlines = new Set(
    existing.map((r) => r.headline?.toLowerCase()).filter(Boolean),
  );
  const done = new Set(existing.map((r) => r.creative_id));

  // Inputs for Kie: product screenshot + official logo, both presigned.
  const shotKey = "creatives/reference/pd-page.png";
  if (!(await getBytes(shotKey))) {
    await putBytes(
      shotKey,
      new Uint8Array(readFileSync(join(root, config.statics.referenceDir, "pd-page.png"))),
      "image/png",
    );
  }
  const logoKey = "creatives/reference/logo-solutionwhere.jpg";
  if (!(await getBytes(logoKey))) {
    await putBytes(logoKey, new Uint8Array(readFileSync(LOGO_LOCAL)), "image/jpeg");
  }
  const shotUrl = await presignGet(shotKey, 3600);
  const logoUrl = await presignGet(logoKey, 3600);

  const csvLines: string[] = [];

  for (const cell of CELLS) {
    const id = `${cell.creative_id}:static`;
    if (done.has(id)) {
      console.log(`skip ${id} — already in fb_creatives`);
      continue;
    }
    let headline = cell.headline;
    if (usedHeadlines.has(headline.toLowerCase())) {
      headline = `${headline.slice(0, 34)} — ${cell.angle}`;
    }
    usedHeadlines.add(headline.toLowerCase());

    const prompt =
      "Turn this product screenshot into a clean vertical Meta ad (9:16 " +
      "portrait, taller than wide) for a B2B education-agency platform. " +
      "Keep the product UI recognizable and sharp — it is the proof. " +
      "Place the provided Solutionwhere logo prominently (top or bottom): " +
      "the mark itself must render exactly — red circle with a white S " +
      "plus the black lowercase \"solutionwhere\" wordmark; only the " +
      "logo's background may change to fit the layout. Add a bold headline " +
      `overlay reading "${headline}". Dark slate background, white text, ` +
      "no stock photography, no children, no people, no URLs or web " +
      "addresses anywhere in the image. Minimal, professional. Portrait " +
      "composition, width smaller than height.";
    console.log(`rendering ${id} …`);
    const url = await renderImage(config.statics.model, {
      prompt,
      imageInput: [shotUrl, logoUrl],
      aspectRatio: "9:16",
      resolution: config.statics.resolution as "1K" | "2K" | "4K",
    });

    const bytes = await download(url);
    const fileKey = `creatives/${DATE}/${cell.creative_id}.png`;
    await putBytes(fileKey, bytes, "image/png");
    await putText(
      `creatives/${DATE}/${cell.creative_id}.json`,
      JSON.stringify(
        {
          creative_id: cell.creative_id,
          persona: "P1",
          angle: cell.angle,
          module: "pd",
          formats: ["static"],
          hook: matrix.rows.find((r) => r.creative_id === `${cell.creative_id.replace(/-v3$/, "-v1")}`)?.hook ?? "",
          landing,
          copy: { primaryText: cell.primaryText, headline, description: cell.description },
          imageUrl: url,
          engine: config.statics.model,
          aspectRatio: "9:16",
          logoInput: logoKey,
        },
        null,
        2,
      ),
      "application/json",
    );

    await db
      .insertInto("fb_creatives")
      .values({
        creative_id: id,
        persona: "P1",
        angle: cell.angle,
        module: "pd",
        format: "static",
        file_key: fileKey,
        headline,
        primary_text: cell.primaryText,
      })
      .onConflict((oc) => oc.column("creative_id").doNothing())
      .execute();

    const local = join(DESKTOP, `MEETING-${cell.creative_id}.png`);
    writeFileSync(local, bytes);
    csvLines.push(
      `${cell.creative_id},P1,${cell.angle},pd,static,${fileKey},${headline.replaceAll(",", ";")}`,
    );
    console.log(`ok ${id} -> ${fileKey} + ${local}`);
  }

  if (csvLines.length) {
    const csvKey = "creatives/creatives.csv";
    const prior = await getBytes(csvKey);
    const header = "creative_id,persona,angle,module,format,file,headline\n";
    const body = prior
      ? `${Buffer.from(prior).toString("utf-8").replace(/\n?$/, "\n")}${csvLines.join("\n")}\n`
      : `${header}${csvLines.join("\n")}\n`;
    await putText(csvKey, body);
    console.log("creatives.csv appended");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => destroyDb());
