import { loadMatrix } from "../creative/factory";
import { getDb } from "../db";
import { fireAlert, postSlack } from "../marketing/alerts";
import { getBytes, presignGet } from "../marketing/storage";
import {
  createAd,
  createImageAdCreative,
  createVideoAdCreative,
  getVideo,
  uploadAdImage,
  uploadAdVideoFromUrl,
} from "./client";
import { fbEnv, fbReady, loadFbConfig, type FbConfig } from "./config";
import { resolveStructure } from "./structure";

// fb-upload-drafts-weekly (04 §6, 07 §4.10): takes human-approved creatives
// from fb_creatives (status 'approved' — the factory writes 'generated', a
// human reviews, 04 §6 "every new ad enters PAUSED and is reviewed before
// activation") and uploads them to the Meta ad account as PAUSED draft ads
// in the CAMP 01 module ad sets.
//
// Per creative: media upload (image bytes / video by presigned URL), an ad
// creative with the row's copy and the persona landing URL + UTMs, then the
// ad itself — name `{creative_id} | {persona} | {angle}` (07 §4.10), status
// PAUSED, always (the client has no other status). fb_ad_id is written back
// on the creative row (status 'draft') and every upload lands in fb_actions.
//
// Modes: no FB_ACCESS_TOKEN -> "no-credentials" plan from the DB; token but
// no --apply -> "dry-run" (reads only; Meta has no validate-only mutate);
// --apply performs the writes. Per 07 §4.10 the run stops on the first API
// error and never retries silently.

export interface PlannedUpload {
  creative_id: string;
  adName: string;
  module: string;
  adSetName: string;
  adSetId: string | null;
  landing: string;
  format: string;
}

export interface UploadReport {
  mode: "no-credentials" | "dry-run" | "apply";
  approved: number;
  planned: PlannedUpload[];
  structure: { adopted: string[]; created: string[]; planned: string[] } | null;
  uploaded: { creative_id: string; fb_ad_id: string }[];
  skipped: { creative_id: string; reason: string }[];
  errors: string[];
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Video processing is async on Meta's side; poll briefly for readiness and
 *  the auto-generated thumbnail (video_data needs image_url). Bounded — a
 *  stuck video surfaces as an error and stops the run, per spec. */
async function waitForVideo(
  videoId: string,
  attempts = 10,
  delayMs = 6_000,
): Promise<string> {
  for (let i = 0; i < attempts; i += 1) {
    const video = await getVideo(videoId);
    if (video.status === "ready") {
      if (!video.picture) throw new Error(`video ${videoId} ready but has no thumbnail`);
      return video.picture;
    }
    if (video.status === "error") {
      throw new Error(`video ${videoId} processing failed on Meta's side`);
    }
    await sleep(delayMs);
  }
  throw new Error(`video ${videoId} still processing after ${attempts} polls`);
}

interface CreativeRow {
  creative_id: string;
  persona: string;
  angle: string;
  module: string;
  format: string;
  file_key: string | null;
  headline: string | null;
  primary_text: string | null;
}

function planUpload(
  row: CreativeRow,
  config: FbConfig,
  matrix: ReturnType<typeof loadMatrix>,
): PlannedUpload | { skipReason: string } {
  const adSetName = config.campaign.adSetsByModule[row.module];
  if (!adSetName) {
    // P5 is module 'all' in matrix.json; 04 §6 maps one ad set per module.
    return {
      skipReason: `no ad set mapped for module '${row.module}' (04 §6 has one broad ad set per module; where cross-module ads live is a human call)`,
    };
  }
  const persona = matrix.personas[row.persona];
  if (!persona) return { skipReason: `persona '${row.persona}' not in matrix.json` };
  if (!row.headline || !row.primary_text) {
    return { skipReason: "missing headline/primary_text" };
  }
  if (!row.file_key) return { skipReason: "missing file_key" };
  return {
    creative_id: row.creative_id,
    adName: `${row.creative_id} | ${row.persona} | ${row.angle}`,
    module: row.module,
    adSetName,
    adSetId: null,
    landing: `${matrix.landingBase}${persona.landing}`,
    format: row.format,
  };
}

async function uploadOne(
  row: CreativeRow,
  plan: PlannedUpload,
  config: FbConfig,
  pageId: string,
): Promise<string> {
  const copy = {
    primaryText: row.primary_text ?? "",
    headline: row.headline ?? "",
    description: null,
    link: plan.landing,
  };

  let creativeId: string;
  if (row.format === "video") {
    const fileUrl = await presignGet(row.file_key ?? "", 3600);
    const videoId = await uploadAdVideoFromUrl(fileUrl, row.creative_id);
    const thumbnailUrl = await waitForVideo(videoId);
    const creative = await createVideoAdCreative({
      name: plan.adName,
      pageId,
      videoId,
      thumbnailUrl,
      urlTags: config.urlTags,
      ...copy,
    });
    creativeId = creative.id;
  } else {
    const bytes = await getBytes(row.file_key ?? "");
    if (!bytes) throw new Error(`storage object missing: ${row.file_key}`);
    const imageHash = await uploadAdImage(bytes, `${row.creative_id}.png`);
    const creative = await createImageAdCreative({
      name: plan.adName,
      pageId,
      imageHash,
      urlTags: config.urlTags,
      ...copy,
    });
    creativeId = creative.id;
  }

  const ad = await createAd({
    name: plan.adName,
    adSetId: plan.adSetId ?? "",
    creativeId,
  });
  return ad.id;
}

export async function runFbUploadDrafts(
  options: { apply?: boolean } = {},
): Promise<UploadReport> {
  const apply = options.apply === true;
  const config = loadFbConfig();
  const matrix = loadMatrix();
  const db = getDb();
  const report: UploadReport = {
    mode: apply ? "apply" : "dry-run",
    approved: 0,
    planned: [],
    structure: null,
    uploaded: [],
    skipped: [],
    errors: [],
  };

  const rows = await db
    .selectFrom("fb_creatives")
    .select([
      "creative_id",
      "persona",
      "angle",
      "module",
      "format",
      "file_key",
      "headline",
      "primary_text",
    ])
    .where("status", "=", "approved")
    .where("fb_ad_id", "is", null)
    .execute();
  report.approved = rows.length;

  const plannedById = new Map<string, PlannedUpload>();
  for (const row of rows) {
    const plan = planUpload(row, config, matrix);
    if ("skipReason" in plan) {
      report.skipped.push({ creative_id: row.creative_id, reason: plan.skipReason });
    } else {
      plannedById.set(row.creative_id, plan);
      report.planned.push(plan);
    }
  }
  if (report.skipped.length > 0) {
    await fireAlert("fb-upload-skipped", "warn", "approved creatives not uploaded", {
      skipped: report.skipped,
      spec: "04 §6 — one broad ad set per module",
    });
  }
  if (rows.length === 0) {
    console.log("No approved creatives awaiting upload.");
    return report;
  }

  if (!fbReady()) {
    report.mode = "no-credentials";
    console.log(
      "FB_ACCESS_TOKEN not set — plan-only. Secrets needed to run live: " +
        "FB_ACCESS_TOKEN, FB_AD_ACCOUNT_ID (defaulted), FB_PAGE_ID (apply).",
    );
    return report;
  }

  // Adopt-first structure resolution. Dry-run is reads only; apply creates
  // the missing campaign/ad sets PAUSED before any ad references them.
  const structure = await resolveStructure(config, apply);
  report.structure = {
    adopted: structure.adopted,
    created: structure.created,
    planned: structure.planned,
  };
  report.errors.push(...structure.errors);
  for (const plan of report.planned) {
    plan.adSetId = structure.adSetIds[plan.module] ?? null;
  }

  if (!apply) {
    console.log(
      `Dry-run: ${report.planned.length} ad(s) would be uploaded PAUSED. ` +
        "Re-run with --apply to write.",
    );
    return report;
  }

  const pageId = fbEnv().FB_PAGE_ID;
  if (!pageId) {
    report.errors.push(
      "FB_PAGE_ID is required for --apply (ad creatives need a Page) — " +
        "graphed secrets set FB_PAGE_ID ...",
    );
    return report;
  }

  const runDate = new Date().toISOString().slice(0, 10);
  for (const row of rows) {
    const plan = plannedById.get(row.creative_id);
    if (!plan) continue;
    if (!plan.adSetId) {
      report.errors.push(`${row.creative_id}: ad set '${plan.adSetName}' unresolved`);
      break; // structure creation failed upstream — stop, don't spray errors
    }
    try {
      const fbAdId = await uploadOne(row, plan, config, pageId);
      await db
        .updateTable("fb_creatives")
        .set({ fb_ad_id: fbAdId, status: "draft" })
        .where("creative_id", "=", row.creative_id)
        .execute();
      await db
        .insertInto("fb_actions")
        .values({
          run_date: runDate,
          ad_id: fbAdId,
          creative_id: row.creative_id,
          action: "upload",
          reason: "weekly draft upload, PAUSED (04 §6)",
          before: JSON.stringify({ status: "approved" }),
          after: JSON.stringify({
            status: "draft",
            fb_ad_id: fbAdId,
            ad_set: plan.adSetName,
            ad_name: plan.adName,
          }),
        })
        .execute();
      report.uploaded.push({ creative_id: row.creative_id, fb_ad_id: fbAdId });
    } catch (error) {
      // 07 §4.10: stop and log on the first API error; never retry silently.
      // The creative stays 'approved' so next week's run picks it back up.
      report.errors.push(
        `${row.creative_id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      break;
    }
  }

  await postSlack(
    `fb-upload-drafts-weekly ${runDate}: ${report.uploaded.length}/${report.planned.length} ` +
      `approved creative(s) uploaded as PAUSED drafts` +
      (report.errors.length > 0 ? ` — stopped on error: ${report.errors[0]}` : ""),
  );

  return report;
}
