import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { projectRoot } from "../packages/core/src/config";
import { getDb, destroyDb } from "../packages/core/src/db";
import { getBytes, presignGet, putBytes, putText } from "../packages/core/src/marketing/storage";
import { renderImage } from "../packages/core/src/creative/kie";
import { loadMatrix, loadCreativeConfig } from "../packages/core/src/creative/factory";

// One-off meeting batch (2026-09-16): regenerate three statics for the top
// two angles of docs/04 §4 (A1 time cost, A2 compliance/audit) at vertical
// 9:16 for Reels/Stories/Feed (Advantage+ placements, 04 §6) — the
// 2026-09-15 batch was 1:1/16:9. Same pipeline as the factory: Kie
// gpt-image-2 img2img remix of the real product screenshots, storage under
// creatives/2026-09-16/, fb_creatives rows at status 'generated',
// creatives.csv appended. Also copies files to
// ~/Desktop/solutionwhere-creatives/2026-09-16/ with a MEETING- prefix.

const DATE = "2026-09-16";
const DESKTOP = join(homedir(), "Desktop/solutionwhere-creatives/2026-09-16");

const CELLS: {
  creative_id: string;
  persona: string;
  angle: string;
  reference: string;
  headline: string;
  primaryText: string;
  description: string;
}[] = [
  {
    creative_id: "P1-A1-v2",
    persona: "P1",
    angle: "A1",
    reference: "pd-page.png",
    headline: "Registration season, minus six weeks",
    primaryText:
      "Three spreadsheets and a Google Form shouldn't decide your fall. PD registration in one place — 80% less admin.",
    description: "See it in 20 minutes",
  },
  {
    creative_id: "P1-A2-v2",
    persona: "P1",
    angle: "A2",
    reference: "pd-page.png",
    headline: "Act 48 hours: a button, not a project",
    primaryText:
      "When PDE asks for Act 48 hours, the answer should already be assembled. Reporting on demand, since 1996.",
    description: "See it in 20 minutes",
  },
  {
    creative_id: "P2-A2-v2",
    persona: "P2",
    angle: "A2",
    reference: "enrollments-page.png",
    headline: "Rerun the lottery in front of the board",
    primaryText:
      "A seeded, re-runnable lottery with an audit trail. Defend it to the board without Excel.",
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

  const existing = await db
    .selectFrom("fb_creatives")
    .select(["creative_id", "headline"])
    .execute();
  const usedHeadlines = new Set(
    existing.map((r) => r.headline?.toLowerCase()).filter(Boolean),
  );
  const done = new Set(existing.map((r) => r.creative_id));

  const csvLines: string[] = [];

  for (const cell of CELLS) {
    const persona = matrix.personas[cell.persona];
    if (!persona) throw new Error(`unknown persona ${cell.persona}`);
    const landing = `${matrix.landingBase}${persona.landing}`;
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

    // Reference screenshot → storage → presigned URL for Kie.
    const refPath = join(root, config.statics.referenceDir, cell.reference);
    const refKey = `creatives/reference/${cell.reference}`;
    if (!(await getBytes(refKey))) {
      await putBytes(refKey, new Uint8Array(readFileSync(refPath)), "image/png");
    }
    const refUrl = await presignGet(refKey, 3600);

    const prompt =
      "Turn this product screenshot into a clean vertical Meta ad (9:16 " +
      "portrait, taller than wide) for a B2B education-agency platform. " +
      "Keep the product UI recognizable and sharp — it is the proof. Add a " +
      "bold headline overlay reading " +
      `"${headline}". Dark slate background, white text, no stock ` +
      "photography, no children, no people. Minimal, professional. " +
      "Portrait composition, width smaller than height.";
    console.log(`rendering ${id} …`);
    const url = await renderImage(config.statics.model, {
      prompt,
      imageInput: [refUrl],
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
          persona: cell.persona,
          angle: cell.angle,
          module: persona.module,
          formats: ["static"],
          hook: matrix.rows.find((r) => r.creative_id === `${cell.creative_id.replace(/-v2$/, "-v1")}`)?.hook ?? "",
          landing,
          copy: { primaryText: cell.primaryText, headline, description: cell.description },
          imageUrl: url,
          engine: config.statics.model,
          aspectRatio: "9:16",
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
        persona: cell.persona,
        angle: cell.angle,
        module: persona.module,
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
      `${cell.creative_id},${cell.persona},${cell.angle},${persona.module},static,${fileKey},${headline.replaceAll(",", ";")}`,
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
