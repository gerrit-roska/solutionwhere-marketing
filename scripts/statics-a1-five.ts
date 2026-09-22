import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { renderImage } from "../packages/core/src/creative/kie";
import { presignGet, putBytes, putText, getBytes } from "../packages/core/src/marketing/storage";

// One offer (A1) across the four ad sets. This pass is the four dark
// squares that failed when five ran together. The light PD file is already saved.

const DATE = "2026-09-22-v5";
const DESKTOP = join(homedir(), "Desktop/solutionwhere-creatives", DATE);
const MODEL = "kie:gpt-image-2-image-to-image";

const JOBS = [
  {
    id: "P1-A1-v5-dark",
    shot: "pd-page.png",
    onImage: "Staff-training signup. Up to 80% less office work.",
    headline: "Get up to 80% of staff-training signup work back.",
    primaryText:
      "Signup season is still a spreadsheet and a Google Form. Teachers sign up in one place, and that busywork drops by up to 80%. Your team keeps the same people. Book a 30-minute demo.",
    description:
      "Teachers sign up in one place. You pull the report when you need it, from numbers that were already right.",
  },
  {
    id: "P2-A1-v5-dark",
    shot: "enrollments-page.png",
    onImage: "School signup on a phone. Same staff.",
    headline: "Get signup season done with the staff you already have.",
    primaryText:
      "Signup season is paper packets, a filing cabinet, and a spreadsheet. Families finish it on a phone. Your office stops retyping every form. Book a 30-minute demo.",
    description:
      "Families sign up on a phone, in their language. Your office sees who got in and who is waiting.",
  },
  {
    id: "P3-A1-v5-dark",
    shot: "coaching-page.png",
    onImage: "Visit log on a tablet. Afternoons back.",
    headline: "Give coaches their afternoons back after each visit.",
    primaryText:
      "Coaches do the visits. The write-up is what eats the afternoon. They write the visit on a tablet, even with no signal, and the report builds from that. Book a 30-minute demo.",
    description: "The visit and the notes are the same thing. Your forms. No student names.",
  },
  {
    id: "P4-A1-v5-dark",
    shot: "referrals-page.png",
    onImage: "Calls, open spots, and the report. One system.",
    headline: "Stop rebuilding the quarterly child-care report by hand.",
    primaryText:
      "When the state asks who got a spot, you should already have it. The follow-up is part of the work, not extra typing. Book a 30-minute demo.",
    description: "Calls, openings, past referrals, and the quarterly report come from one system.",
  },
];

function promptFor(onImage: string): string {
  return [
    "Square 1:1 Meta feed ad. Not vertical, not 9:16. Width equals height.",
    "The first image is the layout to keep: logo at the top, one offer line, one browser window with the product, a few decorative dots.",
    "The second image is the Solutionwhere logo. Use that exact mark. Do not redraw it.",
    "The browser window must show the THIRD image and only that image. Ignore the dashboard inside the first reference. The third image is a different page. Do not show Active courses, 247, or Monthly registrations unless those words are in the third image.",
    `Replace the big text with exactly this line and no other sentence: "${onImage}".`,
    "Under the browser window, add one button that reads exactly: Book a demo.",
    "Dark mode: deep navy background, white offer line, a solid orange rounded button with white text.",
    "Remove any web address from the address bar. Leave it blank.",
    "Do not add a second window, icons, captions, people, children, file names, or the word WISDOMWHERE.",
    "No URL anywhere in the image.",
  ].join(" ");
}

async function main(): Promise<void> {
  mkdirSync(DESKTOP, { recursive: true });
  const baseUrl = await presignGet("creatives/reference/base-static-p1-a1.jpg", 3600);
  const logoUrl = await presignGet("creatives/reference/logo-solutionwhere.png", 3600);
  let ok = 0;
  let failed = 0;
  for (const job of JOBS) {
    const local = join(DESKTOP, `${job.id}.png`);
    if (existsSync(local) && readFileSync(local).byteLength > 10_000) {
      console.log(`skip ${job.id}`);
      continue;
    }
    const shotKey = `creatives/reference/${job.shot}`;
    if (!(await getBytes(shotKey))) {
      throw new Error(`missing storage object ${shotKey}`);
    }
    const shotUrl = await presignGet(shotKey, 3600);
    console.log(`rendering ${job.id}`);
    try {
      const url = await renderImage(MODEL, {
        prompt: promptFor(job.onImage),
        imageInput: [baseUrl, logoUrl, shotUrl],
        aspectRatio: "1:1",
        resolution: "1K",
      });
      const response = await fetch(url);
      if (!response.ok) throw new Error(`download ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      await putBytes(`creatives/${DATE}/${job.id}.png`, bytes, "image/png");
      await putText(
        `creatives/${DATE}/${job.id}.json`,
        JSON.stringify({ ...job, mode: "dark", aspectRatio: "1:1", cta: "Book a demo" }, null, 2),
        "application/json",
      );
      writeFileSync(local, bytes);
      ok += 1;
      console.log(`ok ${job.id}`);
    } catch (error) {
      failed += 1;
      const err = error as { message?: string; status?: number; body?: unknown };
      console.error(
        `fail ${job.id}`,
        err.status ?? "",
        err.message ?? error,
        err.body ? JSON.stringify(err.body).slice(0, 240) : "",
      );
    }
  }
  console.log(`done ok=${ok} failed=${failed}`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
