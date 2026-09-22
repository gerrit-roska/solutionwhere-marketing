import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getDb, destroyDb } from "../packages/core/src/db";
import { getBytes, putBytes, putText } from "../packages/core/src/marketing/storage";
import { loadMatrix } from "../packages/core/src/creative/factory";

// Ingest the 2026-09-16 meeting videos (Higgsfield Marketing Studio,
// 9:16 1080p) into Graphed storage + fb_creatives, mirroring factory.ts's
// insert shape, and copy to ~/Desktop/solutionwhere-creatives/2026-09-16/
// with a MEETING- prefix. Usage: npx tsx scripts/meeting-videos-ingest.ts <id> <url>

const DATE = "2026-09-16";
const DESKTOP = join(homedir(), "Desktop/solutionwhere-creatives/2026-09-16");

const SCRIPTS: Record<string, { script: string; headline: string; primaryText: string }> = {
  "P1-A1-v2": {
    script:
      "Registration season shouldn't cost your team six weeks. But that's what three spreadsheets and a Google Form add up to — and the state report still takes a week. Solutionwhere runs PD registration in one place, cuts the admin by eighty percent, and puts Act 48, SCECH, and CTLE hours one click away. We've done it since 1996. See it in twenty minutes at home.solutionwhere.com.",
    headline: "Six weeks of registration, gone",
    primaryText:
      "Registration season shouldn't cost your team six weeks. One platform, 80% less admin, since 1996.",
  },
  "P1-A2-v2": {
    script:
      "When PDE asks for Act 48 hours, is the answer a button or a project? If your PD records live in spreadsheets, every audit is a scramble. Solutionwhere tracks every registration and every credit hour as it happens, so the state report is already assembled — Act 48, SCECH, CTLE, on demand. Independent since 1996. See it in twenty minutes at home.solutionwhere.com.",
    headline: "Act 48 reporting, already assembled",
    primaryText:
      "When PDE asks for Act 48 hours, is the answer a button or a project? Reporting on demand since 1996.",
  },
};

async function main(): Promise<void> {
  const [id, url] = process.argv.slice(2);
  if (!id || !url || !SCRIPTS[id]) {
    throw new Error(`usage: tsx meeting-videos-ingest.ts <${Object.keys(SCRIPTS).join("|")}> <url>`);
  }
  const matrix = loadMatrix();
  const persona = matrix.personas.P1;
  const landing = `${matrix.landingBase}${persona.landing}`;
  const db = getDb();
  mkdirSync(DESKTOP, { recursive: true });

  const bytes = url.startsWith("/")
    ? new Uint8Array(readFileSync(url))
    : await (async () => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`download ${response.status}`);
        return new Uint8Array(await response.arrayBuffer());
      })();

  const fileKey = `creatives/${DATE}/${id}.mp4`;
  await putBytes(fileKey, bytes, "video/mp4");
  await putText(
    `creatives/${DATE}/${id}.json`,
    JSON.stringify(
      {
        creative_id: id,
        persona: "P1",
        angle: id.split("-")[1],
        module: "pd",
        formats: ["video"],
        landing,
        copy: { primaryText: SCRIPTS[id].primaryText, headline: SCRIPTS[id].headline },
        script: SCRIPTS[id].script,
        engine: "higgsfield:marketing_studio_video",
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
      creative_id: `${id}:video`,
      persona: "P1",
      angle: id.split("-")[1],
      module: "pd",
      format: "video",
      file_key: fileKey,
      headline: SCRIPTS[id].headline,
      primary_text: SCRIPTS[id].primaryText,
    })
    .onConflict((oc) => oc.column("creative_id").doNothing())
    .execute();

  writeFileSync(join(DESKTOP, `MEETING-${id}.mp4`), bytes);

  const csvKey = "creatives/creatives.csv";
  const prior = await getBytes(csvKey);
  const line = `${id},P1,${id.split("-")[1]},pd,video,${fileKey},${SCRIPTS[id].headline}`;
  const body = prior
    ? `${Buffer.from(prior).toString("utf-8").replace(/\n?$/, "\n")}${line}\n`
    : `creative_id,persona,angle,module,format,file,headline\n${line}\n`;
  await putText(csvKey, body);
  console.log(`ok ${id}:video -> ${fileKey} + Desktop`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => destroyDb());
