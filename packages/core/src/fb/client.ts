import { adAccountPath, fbEnv, loadFbConfig } from "./config";

// Meta Marketing API transport (04 §6, 07 §4.10). Mirrors ads/client.ts:
// env through ./config (never process.env), errors throw with the API's own
// message, and per 07 §4.10 there are no silent retries — the first API
// error stops the job and is logged.
//
// The PAUSED-first philosophy (04 §6) is enforced here, at the lowest
// level: every create goes out with status PAUSED and there is no parameter
// to change that. Nothing this client creates can enter the account ENABLED.

export class FbApiError extends Error {
  constructor(
    readonly status: number,
    readonly meta: {
      message?: string;
      type?: string;
      code?: number;
      error_subcode?: number;
      error_user_title?: string;
      error_user_msg?: string;
      error_data?: unknown;
    } | null,
    body: string,
  ) {
    super(
      meta?.message
        ? `Meta API ${status}: ${meta.message} (code ${meta.code ?? "?"}, subcode ${meta.error_subcode ?? "?"})${meta.error_user_msg ? ` — ${meta.error_user_msg}` : ""}`
        : `Meta API ${status}: ${body.slice(0, 300)}`,
    );
    this.name = "FbApiError";
  }
}

const apiBase = (): string =>
  `https://graph.facebook.com/${loadFbConfig().apiVersion}`;

function token(): string {
  const env = fbEnv();
  if (!env.FB_ACCESS_TOKEN) {
    throw new Error(
      "FB_ACCESS_TOKEN is not set — run `graphed secrets set FB_ACCESS_TOKEN ...` (04 §1 item 6)",
    );
  }
  return env.FB_ACCESS_TOKEN;
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Non-JSON error body — FbApiError falls back to the raw text.
  }
  const meta =
    (body as { error?: FbApiError["meta"] } | null)?.error ?? null;
  if (!res.ok || meta) {
    throw new FbApiError(res.status, meta, text);
  }
  return body as T;
}

export async function fbGet<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${apiBase()}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  return parse<T>(res);
}

export async function fbPost<T>(
  path: string,
  fields: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${apiBase()}/${path.replace(/^\//, "")}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(fields),
  });
  return parse<T>(res);
}

async function fbPostForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${apiBase()}/${path.replace(/^\//, "")}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}` },
    body: form,
  });
  return parse<T>(res);
}

// ---- reads (adopt-first, dry-run safe) ---------------------------------------

export interface FbNamedEntity {
  id: string;
  name: string;
  status: string;
}

export async function listCampaigns(): Promise<FbNamedEntity[]> {
  const out = await fbGet<{ data?: { id?: string; name?: string; status?: string }[] }>(
    `${adAccountPath()}/campaigns`,
    { fields: "id,name,status", limit: "200" },
  );
  return (out.data ?? [])
    .filter((r): r is { id: string; name: string; status: string } =>
      Boolean(r.id && r.name),
    )
    .filter((r) => r.status !== "DELETED");
}

export interface FbAdSet extends FbNamedEntity {
  campaignId: string | null;
  dailyBudgetUsd: number | null;
}

export async function listAdSets(): Promise<FbAdSet[]> {
  const out = await fbGet<{
    data?: { id?: string; name?: string; status?: string; campaign_id?: string; daily_budget?: string }[];
  }>(`${adAccountPath()}/adsets`, {
    fields: "id,name,status,campaign_id,daily_budget",
    limit: "200",
  });
  return (out.data ?? [])
    .filter((r): r is { id: string; name: string; status: string } & typeof r =>
      Boolean(r.id && r.name),
    )
    .filter((r) => r.status !== "DELETED")
    .map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      campaignId: r.campaign_id ?? null,
      // Meta money fields are cents (minor units) as strings.
      dailyBudgetUsd: r.daily_budget ? Number(r.daily_budget) / 100 : null,
    }));
}

// ---- creates (always PAUSED — see module comment) ----------------------------

const PAUSED = "PAUSED" as const;

export function createCampaign(fields: {
  name: string;
  objective: string;
  dailyBudgetUsd: number;
}): Promise<{ id: string }> {
  return fbPost<{ id: string }>(`${adAccountPath()}/campaigns`, {
    name: fields.name,
    objective: fields.objective,
    buying_type: "AUCTION",
    status: PAUSED,
    special_ad_categories: [],
    // One campaign budget. Ad sets under this campaign must not set their own.
    daily_budget: Math.round(fields.dailyBudgetUsd * 100),
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
  });
}

export function createAdSet(fields: {
  name: string;
  campaignId: string;
  pixelId: string;
  optimizationEvent: string;
  geoCountries: string[];
  excludedCustomAudienceIds: string[];
}): Promise<{ id: string }> {
  return fbPost<{ id: string }>(`${adAccountPath()}/adsets`, {
    name: fields.name,
    campaign_id: fields.campaignId,
    status: PAUSED,
    billing_event: "IMPRESSIONS",
    optimization_goal: "OFFSITE_CONVERSIONS",
    destination_type: "WEBSITE",
    promoted_object: {
      pixel_id: fields.pixelId,
      custom_event_type: fields.optimizationEvent,
    },
    targeting: {
      geo_locations: { countries: fields.geoCountries },
      // Broad + Advantage+ audience: no interests, no lookalike, no
      // age/gender narrowing (04 §6). Exclusions are the one targeting
      // input that still matters — empty until the audiences exist
      // (clients/solutionwhere/fb.json note).
      ...(fields.excludedCustomAudienceIds.length > 0
        ? {
            excluded_custom_audiences: fields.excludedCustomAudienceIds.map(
              (id) => ({ id }),
            ),
          }
        : {}),
    },
    targeting_automation: { advantage_audience: 1 },
  });
}

// ---- media -------------------------------------------------------------------

/** Synchronous image upload; returns the image_hash creatives reference. */
export async function uploadAdImage(
  bytes: Uint8Array,
  filename: string,
): Promise<string> {
  const form = new FormData();
  form.set("filename", new Blob([bytes], { type: "image/png" }), filename);
  const out = await fbPostForm<{
    images?: Record<string, { hash?: string }>;
  }>(`${adAccountPath()}/adimages`, form);
  const hash = Object.values(out.images ?? {})[0]?.hash;
  if (!hash) throw new Error("adimages returned no hash");
  return hash;
}

/** Video upload from a URL Meta fetches; processing is async server-side. */
export async function uploadAdVideoFromUrl(
  fileUrl: string,
  title: string,
): Promise<string> {
  const out = await fbPost<{ id?: string }>(`${adAccountPath()}/advideos`, {
    file_url: fileUrl,
    title,
  });
  if (!out.id) throw new Error("advideos returned no id");
  return out.id;
}

export async function getVideo(
  videoId: string,
): Promise<{ status: string; picture: string | null }> {
  const out = await fbGet<{
    status?: { video_status?: string };
    picture?: string;
  }>(videoId, { fields: "status,picture" });
  return {
    status: out.status?.video_status ?? "processing",
    picture: out.picture ?? null,
  };
}

// ---- creatives + ads -----------------------------------------------------------

interface LinkCopy {
  primaryText: string;
  headline: string;
  description: string | null;
  link: string;
}

export function createImageAdCreative(
  fields: LinkCopy & { name: string; pageId: string; imageHash: string; urlTags: string },
): Promise<{ id: string }> {
  return createAdCreative(fields.name, fields.pageId, fields.urlTags, {
    page_id: fields.pageId,
    link_data: {
      image_hash: fields.imageHash,
      link: fields.link,
      message: fields.primaryText,
      name: fields.headline,
      ...(fields.description ? { description: fields.description } : {}),
      call_to_action: { type: "LEARN_MORE", value: { link: fields.link } },
    },
  });
}

export function createVideoAdCreative(
  fields: LinkCopy & { name: string; pageId: string; videoId: string; thumbnailUrl: string; urlTags: string },
): Promise<{ id: string }> {
  return createAdCreative(fields.name, fields.pageId, fields.urlTags, {
    page_id: fields.pageId,
    video_data: {
      video_id: fields.videoId,
      image_url: fields.thumbnailUrl,
      message: fields.primaryText,
      title: fields.headline,
      ...(fields.description ? { link_description: fields.description } : {}),
      call_to_action: { type: "LEARN_MORE", value: { link: fields.link } },
    },
  });
}

function createAdCreative(
  name: string,
  pageId: string,
  urlTags: string,
  objectStorySpec: Record<string, unknown>,
): Promise<{ id: string }> {
  return fbPost<{ id: string }>(`${adAccountPath()}/adcreatives`, {
    name,
    object_story_spec: objectStorySpec,
    // 04 §4: UTMs on every ad, with Meta's own campaign/ad name params.
    url_tags: urlTags,
    // 04 §6: Advantage+ creative enhancements OFF — they rewrite headlines
    // and break the one-headline-per-ad rule. standard_enhancements is
    // rejected (subcode 3858504); opt out of the features that change copy.
    degrees_of_freedom_spec: {
      creative_features_spec: {
        text_optimizations: { enroll_status: "OPT_OUT" },
        image_templates: { enroll_status: "OPT_OUT" },
        image_touchups: { enroll_status: "OPT_OUT" },
        enhance_cta: { enroll_status: "OPT_OUT" },
      },
    },
  });
}

export function createAd(fields: {
  name: string;
  adSetId: string;
  creativeId: string;
}): Promise<{ id: string }> {
  return fbPost<{ id: string }>(`${adAccountPath()}/ads`, {
    name: fields.name,
    adset_id: fields.adSetId,
    creative: { creative_id: fields.creativeId },
    status: PAUSED,
  });
}

// ---- management mutations (fb-manage-daily, --apply only) ---------------------

export async function getAdStatus(adId: string): Promise<string | null> {
  const out = await fbGet<{ status?: string }>(adId, { fields: "status" });
  return out.status ?? null;
}

export async function pauseAd(adId: string): Promise<void> {
  await fbPost(adId, { status: PAUSED });
}

export async function setAdSetDailyBudget(
  adSetId: string,
  usd: number,
): Promise<void> {
  await fbPost(adSetId, { daily_budget: Math.round(usd * 100) });
}

export async function findCustomConversion(
  name: string,
): Promise<string | null> {
  const out = await fbGet<{ data?: { id?: string; name?: string }[] }>(
    `${adAccountPath()}/customconversions`,
    { fields: "id,name", limit: "200" },
  );
  return out.data?.find((c) => c.name === name)?.id ?? null;
}

/** 04 §7 Flip rule: move an ad set's optimization to the qualified_demo
 *  custom conversion once it has >= 25 events / 30 days. */
export async function flipAdSetOptimization(
  adSetId: string,
  customConversionId: string,
): Promise<void> {
  await fbPost(adSetId, {
    optimization_goal: "OFFSITE_CONVERSIONS",
    promoted_object: { custom_conversion_id: customConversionId },
  });
}
