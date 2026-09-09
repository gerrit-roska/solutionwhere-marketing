// adapters/index.mjs - the single external write funnel.
// Every Meta Marketing API WRITE in the whole agent flows through
// publishToMeta(). No other module imports graph.facebook.com. This is the
// consolidation the reference lacked (it had three separate write transports).
// Zero deps. Node >= 20. ESM.
import meta from './meta.mjs';

const ADAPTERS = { meta };

// Render the exact payload without any network or auth. Used by DRY_RUN and the
// payload-proof checkpoint so verification asserts real bytes, not a tautology.
export function buildPayload(config, creative) {
  const adapter = ADAPTERS[config.meta_ads?.platform || 'meta'];
  if (!adapter) throw new Error(`no adapter for platform '${config.meta_ads?.platform}'`);
  return adapter.buildPayload(config.meta_ads, creative);
}

// The single write entrypoint. Returns { id, url, status } with
// status in { paused, published, skipped }.
export async function publishToMeta(config, creative) {
  const adapter = ADAPTERS[config.meta_ads?.platform || 'meta'];
  if (!adapter) throw new Error(`no adapter for platform '${config.meta_ads?.platform}'`);
  const auth = adapter.buildAuth(config.meta_ads);
  await adapter.preflight(config.meta_ads, auth);
  const existing = await adapter.findByName(config.meta_ads, auth, creative);
  if (existing) return { id: existing.id, url: existing.url, status: 'skipped' };
  return adapter.create(config.meta_ads, auth, creative);
}

export { ADAPTERS };
