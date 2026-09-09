// adapters/meta.mjs - the Meta Marketing API adapter.
// Zero deps. The ONLY module that talks to graph.facebook.com. Every write in
// the pipeline routes here through adapters/index.mjs publishToMeta().
//
// buildPayload() is PURE (no network, no auth): it renders the exact bytes the
// 3-step create would send. DRY_RUN and the payload-proof verification assert
// against it, so a green offline check reflects real request shapes.
//
// The network path (create/preflight/findByName) is a LOUD STUB by default: it
// throws a clear, actionable error until the integration-confirm gate wires the
// live transport for a real client. This mirrors the SEO factory's custom-go
// adapter: never infer a live payload silently.

const API_BASE = 'https://graph.facebook.com/v21.0';

// Guard: the destination link must never be a placeholder (ports the
// reference's _guard_against_bad_link). Called from buildPayload so even an
// offline payload proof fails on a bad link.
function assertGoodLink(link) {
  if (!link || typeof link !== 'string') throw new Error('creative.destination_link missing');
  if (/todo/i.test(link) || link.includes('example.com'))
    throw new Error(`destination_link is a placeholder (${link}); set client.landing_page to the real URL`);
}

function requireAdAccount(id) {
  if (!/^act_[0-9]+$/.test(id || '')) throw new Error(`ad_account_id must be act_<number>, got ${id}`);
  return id;
}

// PURE: render the create payload. No network, no auth. The steps are the exact
// API calls, in order, that create() executes live. A video creative needs one
// extra step (the mp4 upload) than an image.
export function buildPayload(metaCfg, creative) {
  assertGoodLink(creative.destination_link);
  const acct = requireAdAccount(metaCfg.ad_account_id);
  const isVideo = creative.media_type === 'video';
  if (isVideo && !creative.poster_path)
    throw new Error(`video creative ${creative.creative_id} needs poster_path (Meta requires a video thumbnail image_hash)`);

  const adset = isVideo ? metaCfg.adsets.video : metaCfg.adsets.static;
  if (!adset) throw new Error(`no ${isVideo ? 'video' : 'static'} adset configured for ${creative.creative_id}`);

  // adimage: upload the still (image creative) OR the video POSTER (video
  // creative) to /adimages -> image_hash. Multipart; token in the query string,
  // never an Authorization header (the reference's multipart 401 quirk).
  const adimage = {
    endpoint: `${API_BASE}/${acct}/adimages`,
    method: 'POST',
    transport: 'multipart/form-data',
    tokenLocation: 'query',
    fields: { source: `@${isVideo ? creative.poster_path : creative.local_path}` },
  };

  // advideo (video only): upload the mp4 to /advideos -> video_id. Single-shot
  // multipart for small files; if a direct POST fails, fall back to chunked
  // upload_phase=start/transfer/finish (reference verification skill).
  const advideo = isVideo ? {
    endpoint: `${API_BASE}/${acct}/advideos`,
    method: 'POST',
    transport: 'multipart/form-data',
    tokenLocation: 'query',
    fields: { source: `@${creative.local_path}` },
  } : undefined;

  // adcreative: object_story_spec with page + optional IG actor. Video needs
  // BOTH video_id (from advideos) and image_hash (the poster, from adimages).
  const objectStorySpec = {
    page_id: metaCfg.page_id,
    ...(metaCfg.instagram_id ? { instagram_actor_id: metaCfg.instagram_id } : {}),
    [isVideo ? 'video_data' : 'link_data']: isVideo
      ? { video_id: '<VIDEO_ID from advideos upload>', image_hash: '<IMAGE_HASH from adimages upload of poster_path>', title: creative.variation_name, message: creative.ad_copy, call_to_action: { type: 'LEARN_MORE', value: { link: creative.destination_link } } }
      : { image_hash: '<IMAGE_HASH from adimages upload>', link: creative.destination_link, message: creative.ad_copy, name: creative.variation_name, call_to_action: { type: 'LEARN_MORE', value: { link: creative.destination_link } } },
  };
  const adcreative = {
    endpoint: `${API_BASE}/${acct}/adcreatives`,
    method: 'POST',
    tokenLocation: 'query',
    fields: {
      name: creative.creative_id,
      object_story_spec: objectStorySpec,
      url_tags: metaCfg.utm_template || undefined,
    },
  };

  // ad: ALWAYS created PAUSED (the reference bug is fixed here).
  const ad = {
    endpoint: `${API_BASE}/${acct}/ads`,
    method: 'POST',
    tokenLocation: 'query',
    fields: {
      name: creative.creative_id,
      adset_id: adset,
      creative: { creative_id: '<CREATIVE_ID from adcreatives>' },
      status: 'PAUSED',
    },
  };

  return isVideo ? { advideo, adimage, adcreative, ad } : { adimage, adcreative, ad };
}

// ---- insights fetch layer (optimizer input) --------------------------------
// PURE: render the ad-level insights request for the optimizer. The critical
// param is time_increment: 1 - without it Meta aggregates the whole window
// into ONE row per ad, and "did this ad convert in the last N days"
// (RECENT_CONVERTER, the 7/14 house standard) is unanswerable no matter how
// clever the decision code is. With it, Meta returns one row PER AD PER DAY
// (each carrying date_start), which shapeInsights() folds into the
// optimizer's insight shape: window aggregates + a chronological daily[].
export function buildInsightsRequest(metaCfg, { adsetId, since, until } = {}) {
  const acct = requireAdAccount(metaCfg.ad_account_id);
  if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error(`since must be YYYY-MM-DD, got ${since}`);
  if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new Error(`until must be YYYY-MM-DD, got ${until}`);
  return {
    endpoint: `${API_BASE}/${adsetId || acct}/insights`,
    method: 'GET',
    tokenLocation: 'query',
    fields: {
      level: 'ad',
      fields: 'ad_id,ad_name,adset_id,spend,impressions,clicks,inline_link_clicks,actions,date_start,date_stop',
      time_increment: 1,
      ...(since && until ? { time_range: JSON.stringify({ since, until }) } : {}),
      limit: 500,
    },
  };
}

// Count lead conversions in a row's actions[] (ports the reference
// extract_leads). `leadActionTypes` = e.g. [config.meta_ads.conversion_action_type].
export function extractLeads(actions, leadActionTypes) {
  if (!Array.isArray(actions)) return 0;
  const wanted = new Set(leadActionTypes || []);
  let total = 0;
  for (const a of actions) {
    if (a && typeof a === 'object' && wanted.has(a.action_type)) {
      const n = Number(a.value);
      if (Number.isFinite(n)) total += Math.trunc(n);
    }
  }
  return total;
}

// PURE: fold per-day insight rows (time_increment=1) into one optimizer
// insight per ad: window aggregates plus chronological daily[] rows (the shape
// decideAd's recency rule and decideWinnerAdset's stall rule both walk).
// `adMeta` (optional) merges per-ad fields insights cannot carry -
// { [ad_id]: { effective_status, created_time, promoted } }; age_hours is
// computed from created_time against `now` (ms epoch or Date).
export function shapeInsights(rows, { leadActionTypes, adMeta = {}, now } = {}) {
  const byAd = new Map();
  for (const row of rows || []) {
    const id = String(row.ad_id || '');
    if (!id) continue;
    if (!byAd.has(id)) {
      byAd.set(id, {
        ad_id: id, ad_name: row.ad_name, adset_id: String(row.adset_id || ''),
        spend: 0, leads: 0, impressions: 0, clicks: 0, daily: [],
      });
    }
    const ad = byAd.get(id);
    const spend = Number(row.spend || 0);
    const leads = extractLeads(row.actions, leadActionTypes);
    ad.spend += spend;
    ad.leads += leads;
    ad.impressions += Number(row.impressions || 0);
    ad.clicks += Number(row.clicks || 0);
    ad.daily.push({ date: row.date_start, leads, spend });
  }
  const nowMs = now instanceof Date ? now.getTime() : now;
  const out = [];
  for (const ad of byAd.values()) {
    ad.daily.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const meta = adMeta[ad.ad_id];
    if (meta) {
      if (meta.effective_status != null) ad.effective_status = meta.effective_status;
      if (meta.promoted != null) ad.promoted = meta.promoted;
      if (meta.created_time && nowMs != null) {
        const created = Date.parse(meta.created_time);
        if (Number.isFinite(created)) ad.age_hours = (nowMs - created) / 3600000;
      }
    }
    out.push(ad);
  }
  return out;
}

export async function fetchInsights(metaCfg, auth, opts) {
  // Real: GET buildInsightsRequest() with paging (paginate on paging.next),
  // then shapeInsights() the rows. Loud stub until the live transport is wired
  // at the integration-confirm gate, like every other network path here.
  buildInsightsRequest(metaCfg, opts || {}); // still proves the request is renderable
  return liveCall();
}

// Env NAMES the Hermes pod injects platform-wide with a non-secret PLACEHOLDER
// value (e.g. GRAPHED_API_KEY=proxy-managed). Pointing access_token_env at one
// resolves to a NON-EMPTY junk token that silently shadows the real key. Always
// use a client-specific name; scaffold.mjs rejects these at build time too.
const RESERVED_ENV_NAMES = new Set(['GRAPHED_API_KEY']);
const RESERVED_ENV_VALUES = new Set(['proxy-managed']);

export function buildAuth(metaCfg) {
  const name = metaCfg.access_token_env || 'FB_ACCESS_TOKEN';
  if (RESERVED_ENV_NAMES.has(name))
    throw new Error(`refusing reserved env name "${name}" (Hermes injects it platform-wide with a placeholder; use a client-specific name)`);
  const token = process.env[name];
  if (!token) throw new Error(`missing env ${name} (no hardcoded fallback allowed)`);
  if (RESERVED_ENV_VALUES.has(token))
    throw new Error(`${name} resolved to the reserved pod placeholder "${token}" instead of a real token; the name likely collides with a Hermes-injected variable`);
  if (!token.startsWith('EAA')) throw new Error(`${name} does not look like a Meta token (expected EAA... prefix)`);
  return { token, tokenEnv: name };
}

async function liveCall() {
  throw new Error(
    'live Meta write is not wired for this agent yet. Complete the integration-confirm gate: ' +
    'confirm the ad-account/page/adset schema with a live READ, then implement the fetch transport ' +
    '(token in query, multipart for adimages, chunked upload for advideos). buildPayload() already ' +
    'renders the exact bytes to send - diff it against a live read before the first write.',
  );
}

export async function preflight(metaCfg, auth) {
  requireAdAccount(metaCfg.ad_account_id);
  if (!auth?.token) throw new Error('preflight: no auth token');
  // Real preflight: GET /me (token), GET /act_<id> (account reachable),
  // GET /<adset> (targeting geo == config.client.geo). Loud stub until wired.
  return liveCall();
}

export async function findByName(metaCfg, auth, creative) {
  // Real: GET /act_<id>/ads?filtering=[{field:name,operator:EQUAL,value:creative.creative_id}]
  // for dedup by (date, variation_name). Loud stub until wired.
  return liveCall();
}

export async function create(metaCfg, auth, creative) {
  // Real: execute buildPayload()'s three steps in order with rate-limit sleeps,
  // stop-and-log on any error (error_user_msg), return { id, url, status:'paused' }.
  buildPayload(metaCfg, creative); // still proves the payload is renderable
  return liveCall();
}

export default { buildAuth, preflight, findByName, create, buildPayload, buildInsightsRequest, extractLeads, shapeInsights, fetchInsights };
