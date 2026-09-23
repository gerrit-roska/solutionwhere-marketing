import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../config";
import { getDb } from "../db";
import {
  assertNoBlockedClaims,
  findBlockedClaims,
  redactBlockedClaims,
} from "../marketing/claim-qa";
import { chat } from "../marketing/graphed";
import { getBytes, presignGet, putBytes, putText } from "../marketing/storage";
import { renderAvatarVideo } from "./heygen";
import { renderImage } from "./kie";

// The creative factory (04-meta-ads-execution.md §5, 07 §4.10). Reads the
// persona × angle matrix, writes a 30-second script and ad copy per row via
// the OpenRouter proxy, renders talking-head video through HeyGen and
// statics as img2img remixes of the product-screenshot reference set
// (get_built pattern), stores everything in project storage under
// creatives/YYYY-MM-DD/, and inserts fb_creatives rows at status
// 'generated'. No Meta publishing — a human reviews, fb-upload-drafts-weekly
// comes later (02 §Meta gates it).

const COPY_MODEL = "anthropic/claude-sonnet-4.5";

export interface MatrixPersona {
  name: string;
  module: string;
  landing: string;
  pain: string;
  proof: string;
}

export interface MatrixRow {
  creative_id: string;
  persona: string;
  angle: string;
  hook: string;
  formats: ("video" | "static")[];
}

interface Matrix {
  landingBase: string;
  personas: Record<string, MatrixPersona>;
  rows: MatrixRow[];
}

interface CreativeConfig {
  avatar: { engine: string; avatarId: string; voiceId: string };
  statics: {
    model: string;
    aspectRatio: string;
    resolution: string;
    referenceDir: string;
  };
  video: {
    aspectRatio: "16:9" | "9:16" | "4:5" | "1:1";
    resolution: "1080p" | "720p" | "4k";
  };
  videoSeconds: number;
  reviewBatch: { videos: number; statics: number };
}

export function loadMatrix(root = projectRoot()): Matrix {
  return JSON.parse(
    readFileSync(join(root, "clients/solutionwhere/creative/matrix.json"), "utf-8"),
  ) as Matrix;
}

export function loadCreativeConfig(root = projectRoot()): CreativeConfig {
  return JSON.parse(
    readFileSync(join(root, "clients/solutionwhere/creative/config.json"), "utf-8"),
  ) as CreativeConfig;
}

const ANGLE_NAMES: Record<string, string> = {
  A1: "time cost",
  A2: "compliance / audit",
  A3: "peer proof",
  A4: "independence",
  A5: "buy one module",
  A6: "real support",
  A7: "migration",
  A8: "product demo",
};

async function writeScript(
  row: MatrixRow,
  persona: MatrixPersona,
  seconds: number,
): Promise<string> {
  const words = Math.round(seconds * 2.4); // spoken pace ≈ 2.4 words/sec
  return chat(COPY_MODEL, [
    {
      role: "system",
      content:
        "You write spoken-word scripts for B2B ads read by one avatar to camera. " +
        "Plain sentences, no feature lists, no hype, no emojis. The buyer is a " +
        "public-education agency administrator. Output ONLY the script text.",
    },
    {
      role: "user",
      content:
        `Write a ${seconds}-second script (about ${words} words) for a talking-head ad.\n` +
        `Persona: ${persona.name}.\n` +
        `Angle: ${ANGLE_NAMES[row.angle] ?? row.angle}.\n` +
        (row.hook ? `Open on this hook, verbatim: "${row.hook}"\n` : "") +
        `Pain in their words: "${persona.pain}".\n` +
        `Proof to land: ${persona.proof}.\n` +
        `End with exactly one CTA: "See it in 20 minutes" (a demo, not a trial).\n` +
        `The company is Solutionwhere — say the name once, near the end.`,
    },
  ]);
}

interface AdCopy {
  primaryText: string;
  headline: string;
  description: string;
}

async function writeCopy(
  row: MatrixRow,
  persona: MatrixPersona,
  usedHeadlines: Set<string>,
): Promise<AdCopy> {
  const raw = await chat(COPY_MODEL, [
    {
      role: "system",
      content:
        "You write Meta ad copy for a B2B education-agency platform. Output " +
        "ONLY a JSON object: {\"primaryText\": string, \"headline\": string, " +
        "\"description\": string}. Hard limits: primaryText ≤ 125 characters, " +
        "headline ≤ 40 characters, description ≤ 30 characters. No emojis. " +
        "No feature lists. Never claim WCAG or SOC 2 compliance. Never name " +
        "a customer, district, or agency.",
    },
    {
      role: "user",
      content:
        `Persona: ${persona.name}. Angle: ${ANGLE_NAMES[row.angle] ?? row.angle}.\n` +
        (row.hook
          ? `Hook: "${redactBlockedClaims(row.hook)}".\n`
          : "This is a product-demo ad; the visual carries it.\n") +
        `Pain: "${persona.pain}". Proof: ${redactBlockedClaims(persona.proof)}.\n` +
        `The headline must be unique — do not reuse any of these: ${[...usedHeadlines].join(" | ") || "(none yet)"}.`,
    },
  ]);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`copy writer returned no JSON: ${raw.slice(0, 200)}`);
  const parsed = JSON.parse(match[0]) as Record<string, string>;
  const copy = {
    primaryText: String(parsed.primaryText ?? "").slice(0, 300),
    headline: String(parsed.headline ?? "").slice(0, 60),
    description: String(parsed.description ?? "").slice(0, 60),
  };
  if (!copy.headline) throw new Error("copy writer returned an empty headline");
  assertNoBlockedClaims(
    [copy.primaryText, copy.headline, copy.description].join("\n"),
    "Facebook ad copy",
  );
  return copy;
}

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`download ${response.status}: ${url.slice(0, 120)}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Reference screenshots, uploaded to storage once so Kie can fetch them. */
async function referenceUrls(config: CreativeConfig, dateStamp: string): Promise<string[]> {
  const dir = join(projectRoot(), config.statics.referenceDir);
  const files = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
  const urls: string[] = [];
  for (const file of files) {
    const key = `creatives/reference/${file}`;
    const existing = await getBytes(key);
    if (!existing) {
      await putBytes(key, new Uint8Array(readFileSync(join(dir, file))), "image/png");
    }
    urls.push(await presignGet(key, 3600));
  }
  return urls;
}

export interface FactoryOptions {
  /** Only these creative_ids (default: all rows). */
  only?: string[];
  /** Cap on videos and statics this run (default: no cap). */
  maxVideos?: number;
  maxStatics?: number;
}

export interface FactoryResult {
  dateStamp: string;
  generated: {
    creative_id: string;
    format: string;
    file_key: string;
    headline: string;
  }[];
  skipped: { creative_id: string; reason: string }[];
  errors: { creative_id: string; error: string }[];
}

export async function runCreativeFactory(
  options: FactoryOptions = {},
): Promise<FactoryResult> {
  const matrix = loadMatrix();
  const config = loadCreativeConfig();
  const db = getDb();
  const dateStamp = new Date().toISOString().slice(0, 10);
  const result: FactoryResult = {
    dateStamp,
    generated: [],
    skipped: [],
    errors: [],
  };

  // Unique headline per ad (04 §4: Meta collapses duplicates into one
  // auction entry) — enforced against both the DB and this run.
  const existing = await db
    .selectFrom("fb_creatives")
    .select(["creative_id", "headline", "format"])
    .execute();
  const usedHeadlines = new Set(
    existing.map((r) => r.headline).filter((h): h is string => Boolean(h)),
  );
  // DB creative_id is the per-asset composite `${matrixId}:${format}`.
  const done = new Set(existing.map((r) => r.creative_id));

  let refUrls: string[] | null = null;
  let refCursor = 0;
  let videos = 0;
  let statics = 0;

  const rows = matrix.rows.filter(
    (row) => !options.only || options.only.includes(row.creative_id),
  );

  for (const row of rows) {
    const persona = matrix.personas[row.persona];
    if (!persona) {
      result.skipped.push({ creative_id: row.creative_id, reason: "unknown persona" });
      continue;
    }
    const landing = `${matrix.landingBase}${persona.landing}`;
    const claimHits = findBlockedClaims(row.hook ?? "");
    if (claimHits.length > 0) {
      result.skipped.push({
        creative_id: row.creative_id,
        reason: `claim QA: ${claimHits.join(", ")}`,
      });
      continue;
    }

    for (const format of row.formats) {
      if (done.has(`${row.creative_id}:${format}`)) {
        result.skipped.push({ creative_id: row.creative_id, reason: `${format} already generated` });
        continue;
      }
      if (format === "video" && options.maxVideos !== undefined && videos >= options.maxVideos) {
        continue;
      }
      if (format === "static" && options.maxStatics !== undefined && statics >= options.maxStatics) {
        continue;
      }

      try {
        const copy = await writeCopy(row, persona, usedHeadlines);
        if (usedHeadlines.has(copy.headline.toLowerCase())) {
          copy.headline = `${copy.headline.slice(0, 34)} — ${row.angle}`;
        }
        usedHeadlines.add(copy.headline.toLowerCase());

        let fileKey: string;
        if (format === "video") {
          const script = await writeScript(row, persona, config.videoSeconds);
          const video = await renderAvatarVideo({
            script,
            avatarId: config.avatar.avatarId,
            voiceId: config.avatar.voiceId,
            title: row.creative_id,
            aspectRatio: config.video.aspectRatio,
            resolution: config.video.resolution,
            captionSrt: true,
          });
          fileKey = `creatives/${dateStamp}/${row.creative_id}.mp4`;
          await putBytes(fileKey, await download(video.videoUrl), "video/mp4");
          await putText(
            `creatives/${dateStamp}/${row.creative_id}.json`,
            JSON.stringify({ ...row, landing, copy, script, video }, null, 2),
            "application/json",
          );
          videos += 1;
        } else {
          refUrls ??= await referenceUrls(config, dateStamp);
          const reference = refUrls[refCursor % refUrls.length];
          refCursor += 1;
          const prompt =
            "Turn this product screenshot into a clean Meta feed ad for a B2B " +
            "education-agency platform. Keep the product UI recognizable and " +
            "sharp — it is the proof. Add a bold headline overlay reading " +
            `"${copy.headline}". Dark slate background, white text, no stock ` +
            "photography, no children, no people. Minimal, professional.";
          const url = await renderImage(config.statics.model, {
            prompt,
            imageInput: [reference],
            aspectRatio: config.statics.aspectRatio,
            resolution: config.statics.resolution as "1K" | "2K" | "4K",
            outputFormat: "png",
          });
          fileKey = `creatives/${dateStamp}/${row.creative_id}.png`;
          await putBytes(fileKey, await download(url), "image/png");
          await putText(
            `creatives/${dateStamp}/${row.creative_id}.json`,
            JSON.stringify({ ...row, landing, copy, imageUrl: url }, null, 2),
            "application/json",
          );
          statics += 1;
        }

        await db
          .insertInto("fb_creatives")
          .values({
            creative_id: `${row.creative_id}:${format}`,
            persona: row.persona,
            angle: row.angle,
            module: persona.module,
            format,
            file_key: fileKey,
            headline: copy.headline,
            primary_text: copy.primaryText,
          })
          .onConflict((oc) => oc.column("creative_id").doNothing())
          .execute();
        result.generated.push({
          creative_id: row.creative_id,
          format,
          file_key: fileKey,
          headline: copy.headline,
        });
      } catch (error) {
        result.errors.push({
          creative_id: row.creative_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // creatives.csv — the upload job's manifest (04 §5). Read-append-write.
  if (result.generated.length > 0) {
    const csvKey = "creatives/creatives.csv";
    const prior = await getBytes(csvKey);
    const header = "creative_id,persona,angle,module,format,file,headline\n";
    const lines = result.generated
      .map((g) => {
        const row = matrix.rows.find((r) => r.creative_id === g.creative_id);
        const persona = row ? matrix.personas[row.persona] : null;
        const headline = g.headline.replaceAll(",", ";");
        return `${g.creative_id},${row?.persona ?? ""},${row?.angle ?? ""},${persona?.module ?? ""},${g.format},${g.file_key},${headline}`;
      })
      .join("\n");
    const body = prior
      ? `${Buffer.from(prior).toString("utf-8").replace(/\n?$/, "\n")}${lines}\n`
      : `${header}${lines}\n`;
    await putText(csvKey, body);
  }

  return result;
}
