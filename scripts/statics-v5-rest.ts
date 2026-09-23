import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { renderImage } from "../packages/core/src/creative/kie";
import { getBytes, presignGet, putBytes, putText } from "../packages/core/src/marketing/storage";

// Remaining 1:1 statics. Skips any PNG already on the Desktop over 10KB.
// A1 dark for all four modules, plus P1-A1 light, are already saved.

const DATE = "2026-09-22-v5";
const DESKTOP = join(homedir(), "Desktop/solutionwhere-creatives", DATE);
const MODEL = "kie:gpt-image-2-image-to-image";

type Mode = "dark" | "light";

interface Cell {
  persona: string;
  shot: string;
  angle: string;
  onImage: string;
  headline: string;
  primaryText: string;
  description: string;
}

const CELLS: Cell[] = [
  {
    persona: "P1",
    shot: "pd-page.png",
    angle: "A1",
    onImage: "Staff-training signup. Up to 80% less office work.",
    headline: "Get up to 80% of staff-training signup work back.",
    primaryText:
      "Signup season is still a spreadsheet and a Google Form. Teachers sign up in one place, and that busywork drops by up to 80%. Your team keeps the same people. Book a 30-minute demo.",
    description:
      "Teachers sign up in one place. You pull the report when you need it, from numbers that were already right.",
  },
  {
    persona: "P1",
    shot: "pd-page.png",
    angle: "A2",
    onImage: "The state training report, in minutes.",
    headline: "Pull the yearly training report in minutes, not a week.",
    primaryText:
      "The yearly training report should not take a week of spreadsheets. You pull it when you need it, from signups that were already right. Book a 30-minute demo.",
    description:
      "Hours and signups live in one place, so the report is already there when the state asks.",
  },
  {
    persona: "P1",
    shot: "pd-page.png",
    angle: "A3",
    onImage: "Staff-training signup, the way Lyons Township runs it.",
    headline: "Get the training-signup hours back with the team you have.",
    primaryText:
      "Lyons Township already runs training signup in one place. You get the busywork down by up to 80%, with the people you already have. Book a 30-minute demo.",
    description: "One district system for classes, hours, and the report. Same staff.",
  },
  {
    persona: "P1",
    shot: "pd-page.png",
    angle: "A4",
    onImage: "Training signup that stays. Up to 80% less work.",
    headline: "Keep the hours you save. This company does not get bought.",
    primaryText:
      "You can cut signup work by up to 80% and still be here in five years. Same company since 1996. You do not pay to move again. Book a 30-minute demo.",
    description:
      "Staff training stays in one place. You are not buying a tool that gets sold out from under you.",
  },
  {
    persona: "P1",
    shot: "pd-page.png",
    angle: "A5",
    onImage: "Only training signup. Up to 80% less work.",
    headline: "Buy only staff-training signup, and get the hours back.",
    primaryText:
      "You do not need a whole new system. Buy staff-training signup, cut that busywork by up to 80%, and add the other parts later. Book a 30-minute demo.",
    description: "You start with training signup. School signup or coaching can wait.",
  },
  {
    persona: "P2",
    shot: "enrollments-page.png",
    angle: "A1",
    onImage: "School signup on a phone. Same staff.",
    headline: "Get signup season done with the staff you already have.",
    primaryText:
      "Signup season is paper packets, a filing cabinet, and a spreadsheet. Families finish it on a phone. Your office stops retyping every form. Book a 30-minute demo.",
    description:
      "Families sign up on a phone, in their language. Your office sees who got in and who is waiting.",
  },
  {
    persona: "P2",
    shot: "enrollments-page.png",
    angle: "A2",
    onImage: "Who got a seat, without rebuilding the list.",
    headline: "Show who got a seat without rebuilding the list by hand.",
    primaryText:
      "When a family asks why their child did not get the school, you should already have the answer. You run it with your own rules. Book a 30-minute demo.",
    description: "Seats, the waiting list, and who moved schools sit on one screen.",
  },
  {
    persona: "P2",
    shot: "enrollments-page.png",
    angle: "A3",
    onImage: "Online school signup. No new hire.",
    headline: "Move school signup online without hiring anyone new.",
    primaryText:
      "Districts moved the whole signup online. Checking papers and catching the same kid twice stop being hand work. You keep the same team. Book a 30-minute demo.",
    description: "Families sign up themselves. Your office reviews the list instead of typing it.",
  },
  {
    persona: "P2",
    shot: "enrollments-page.png",
    angle: "A4",
    onImage: "School signup that stays when your system is sold.",
    headline: "Keep school signup working when your student system gets sold.",
    primaryText:
      "Your student system keeps getting bought. School signup should not have to start over. Families stay on a phone. Your office keeps the same list. Book a 30-minute demo.",
    description: "School signup lives on its own. A new student system does not make you rebuild it.",
  },
  {
    persona: "P2",
    shot: "enrollments-page.png",
    angle: "A5",
    onImage: "Only school signup. Ready next season.",
    headline: "Buy only school signup, and have it ready for next season.",
    primaryText:
      "You do not need a new student system. You need families signed up before the next season, with the staff you have. Book a 30-minute demo.",
    description: "You buy school signup only. The rest of the system can wait.",
  },
  {
    persona: "P3",
    shot: "coaching-page.png",
    angle: "A1",
    onImage: "Visit log on a tablet. Afternoons back.",
    headline: "Give coaches their afternoons back after each visit.",
    primaryText:
      "Coaches do the visits. The write-up is what eats the afternoon. They write the visit on a tablet, even with no signal, and the report builds from that. Book a 30-minute demo.",
    description: "The visit and the notes are the same thing. Your forms. No student names.",
  },
  {
    persona: "P3",
    shot: "coaching-page.png",
    angle: "A2",
    onImage: "Coaching report, ready when the state asks.",
    headline: "Have the coaching report ready when the state asks.",
    primaryText:
      "Most teams rebuild the year from a log, a form, and memory. Here the report builds from the visits themselves. Book a 30-minute demo.",
    description: "Coaches write the visit in the field. The yearly report comes from those notes.",
  },
  {
    persona: "P3",
    shot: "coaching-page.png",
    angle: "A3",
    onImage: "Coaches using it in about 30 days.",
    headline: "Get coaches writing visits in the system in about 30 days.",
    primaryText:
      "One agency had coaches working in it in about 30 days. The spreadsheets went away. Your own forms, from the classroom. Book a 30-minute demo.",
    description: "Coaches use your forms. The notes and the state report come from the same visit.",
  },
  {
    persona: "P3",
    shot: "coaching-page.png",
    angle: "A4",
    onImage: "A coaching log, not a testing system.",
    headline: "Pay for coaching notes only, not a whole testing system.",
    primaryText:
      "You should not buy a big testing system just to keep visit notes. This stays a coaching tool. Coaches write less. You still have the report. Book a 30-minute demo.",
    description: "Your forms, your way of coaching. It does not turn into a testing product.",
  },
  {
    persona: "P3",
    shot: "coaching-page.png",
    angle: "A5",
    onImage: "One visit log. The report builds itself.",
    headline: "Buy only the visit log. The report builds from the notes.",
    primaryText:
      "You do not need a whole evaluation system. You need the visit and the notes to be the same thing, so the report is already done. Book a 30-minute demo.",
    description: "Coaches log the visit. The yearly report comes from those logs.",
  },
  {
    persona: "P4",
    shot: "referrals-page.png",
    angle: "A1",
    onImage: "Calls, open spots, and the report. One system.",
    headline: "Stop rebuilding the quarterly child-care report by hand.",
    primaryText:
      "When the state asks who got a spot, you should already have it. The follow-up is part of the work, not extra typing. Book a 30-minute demo.",
    description: "Calls, openings, past referrals, and the quarterly report come from one system.",
  },
  {
    persona: "P4",
    shot: "referrals-page.png",
    angle: "A2",
    onImage: "One family list. The numbers match.",
    headline: "Stop keeping child-care families in four different lists.",
    primaryText:
      "Most child-care teams run four lists: call notes, the provider list, a spreadsheet, and a report built by hand. One system does all four, so the numbers match. Book a 30-minute demo.",
    description: "Openings, past referrals, and the monthly report come from the same work.",
  },
  {
    persona: "P4",
    shot: "referrals-page.png",
    angle: "A3",
    onImage: "Open child-care spots. On Track by 5 runs it.",
    headline: "Match families to child care without a pile of callbacks.",
    primaryText:
      "On Track by 5 runs family matching in one system. A parent who needs a baby spot near work is a search, not a stack of callbacks. Book a 30-minute demo.",
    description: "Openings and past referrals are a search. The monthly report comes from that same work.",
  },
  {
    persona: "P4",
    shot: "referrals-page.png",
    angle: "A4",
    onImage: "Calls and the state report. One system.",
    headline: "Stop paying staff to keep a 15-year-old tool alive.",
    primaryText:
      "Fifteen years on the same tool means your people are the system. Calls, providers, and the state report can live in one place instead. Book a 30-minute demo.",
    description: "You move calls, providers, and the report together. You buy only that.",
  },
  {
    persona: "P4",
    shot: "referrals-page.png",
    angle: "A5",
    onImage: "From the parent call to the state report.",
    headline: "Go from the parent call to the state report in one system.",
    primaryText:
      "You do not have to replace every tool you own. The call, the opening, and who got a spot can live together. Book a 30-minute demo.",
    description: "One system for the call, the opening, and the report. The rest can stay.",
  },
];

const MODES: Mode[] = ["dark", "light"];

function idFor(cell: Cell, mode: Mode): string {
  return `${cell.persona}-${cell.angle}-v5-${mode}`;
}

function promptFor(onImage: string, mode: Mode): string {
  const surface =
    mode === "dark"
      ? "Dark mode: deep navy background, white offer line, a solid orange rounded button with white text."
      : "Light mode: warm off-white background, navy offer line, a solid navy rounded button with white text.";
  return [
    "Square 1:1 Meta feed ad. Not vertical, not 9:16. Width equals height.",
    "The first image is the layout to keep: logo at the top, one offer line, one browser window with the product, a few decorative dots.",
    "The second image is the Solutionwhere logo. Use that exact mark. Do not redraw it.",
    "The browser window must show the THIRD image and only that image. Ignore the dashboard inside the first reference. The third image is a different page.",
    `Replace the big text with exactly this line and no other sentence: "${onImage}".`,
    "Under the browser window, add one button that reads exactly: Book a demo.",
    "The button is the only call to action. Do not add a second line of copy under it.",
    surface,
    "Remove any web address from the address bar. Leave it blank.",
    "Do not add a second window, icons, captions, people, children, file names, or the word WISDOMWHERE.",
    "No URL anywhere in the image.",
  ].join(" ");
}

async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  async function next(): Promise<void> {
    const index = cursor;
    cursor += 1;
    if (index >= items.length) return;
    await worker(items[index]);
    await next();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
}

async function renderOnce(
  cell: Cell,
  mode: Mode,
  baseUrl: string,
  logoUrl: string,
  shotUrl: string,
): Promise<void> {
  const creativeId = idFor(cell, mode);
  const url = await renderImage(MODEL, {
    prompt: promptFor(cell.onImage, mode),
    imageInput: [baseUrl, logoUrl, shotUrl],
    aspectRatio: "1:1",
    resolution: "1K",
  });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  await putBytes(`creatives/${DATE}/${creativeId}.png`, bytes, "image/png");
  await putText(
    `creatives/${DATE}/${creativeId}.json`,
    JSON.stringify(
      {
        creativeId,
        persona: cell.persona,
        angle: cell.angle,
        mode,
        onImage: cell.onImage,
        headline: cell.headline,
        primaryText: cell.primaryText,
        description: cell.description,
        cta: "Book a demo",
        aspectRatio: "1:1",
      },
      null,
      2,
    ),
    "application/json",
  );
  writeFileSync(join(DESKTOP, `${creativeId}.png`), bytes);
}

async function main(): Promise<void> {
  mkdirSync(DESKTOP, { recursive: true });
  const baseUrl = await presignGet("creatives/reference/base-static-p1-a1.jpg", 3600);
  const logoUrl = await presignGet("creatives/reference/logo-solutionwhere.png", 3600);
  const shotUrls = new Map<string, string>();
  for (const shot of new Set(CELLS.map((cell) => cell.shot))) {
    const key = `creatives/reference/${shot}`;
    if (!(await getBytes(key))) throw new Error(`missing storage object ${key}`);
    shotUrls.set(shot, await presignGet(key, 3600));
  }

  const jobs = CELLS.flatMap((cell) => MODES.map((mode) => ({ cell, mode })));
  let ok = 0;
  let failed = 0;
  let skipped = 0;

  await pool(jobs, 1, async ({ cell, mode }) => {
    const creativeId = idFor(cell, mode);
    const local = join(DESKTOP, `${creativeId}.png`);
    if (existsSync(local) && readFileSync(local).byteLength > 10_000) {
      skipped += 1;
      console.log(`skip ${creativeId}`);
      return;
    }
    console.log(`rendering ${creativeId}`);
    let last = "";
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const freshBase = await presignGet("creatives/reference/base-static-p1-a1.jpg", 3600);
        const freshLogo = await presignGet("creatives/reference/logo-solutionwhere.png", 3600);
        const freshShot = await presignGet(`creatives/reference/${cell.shot}`, 3600);
        await renderOnce(cell, mode, freshBase, freshLogo, freshShot);
        ok += 1;
        console.log(`ok ${creativeId}`);
        return;
      } catch (error) {
        const err = error as { message?: string; status?: number };
        last = `${err.status ?? ""} ${err.message ?? error}`.trim();
        console.error(`fail ${creativeId} attempt ${attempt}`, last);
      }
    }
    failed += 1;
    console.error(`giveup ${creativeId}`, last);
  });

  console.log(`done ok=${ok} failed=${failed} skipped=${skipped} dir=${DESKTOP}`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
