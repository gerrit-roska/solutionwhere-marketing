// optimizer.mjs - daily kill/promote decisions. Pure functions over Meta
// insights; all thresholds from config.optimization (never hardcoded).
// Ported from the reference pruning.py / promote_winners.py. Zero deps.
//
// decideAd() returns a decision record; the pipeline aggregates them into an
// audit log and (outside DRY_RUN, via the adapter) applies the pauses/promotes.
// Nothing here touches the network - actions are the caller's job.

const DEFAULTS = {
  target_cpl: 50,
  window_days: 14,
  min_age_hours: 36,
  min_spend_to_judge: 35,
  zero_conv_kill_multiple: 1.5,
  cpl_kill_multiple: 1.5,
  enable_ctr_rule: true,
  min_ctr: 0.01,
  max_pauses_per_run: 15,
  max_promotions_per_run: 10,
  // House pruning standard (7/14 sync). All three default OFF/neutral so
  // already-stamped clients are unchanged until their config opts in.
  conversion_recency_days: 3, // KEEP window; only fires when insight.daily rows exist
  hard_cpa_cap: null,         // absolute currency ceiling; null = disabled
  kill_action: 'PAUSE',       // 'DELETE' frees ad-set cap slots (paused ads still count)
};

export function optConfig(config) {
  return { ...DEFAULTS, ...(config.optimization || {}) };
}

// Leads within the trailing N per-day rows. `daily` comes from the fetch
// layer's time_increment=1 insights (chronological, ending at the most recent
// day) — the same trailing-slice idiom as decideWinnerAdset's stall rule.
// Returns null when no daily rows exist: recency is then UNKNOWABLE and the
// recent-converter keep must not fire (legacy aggregate-only behavior).
function leadsWithinRecencyWindow(insight, days) {
  if (!Array.isArray(insight.daily) || insight.daily.length === 0) return null;
  return insight.daily.slice(-days).reduce((s, d) => s + (d.leads || 0), 0);
}

// A single ad's decision. `insight` = { ad_id, ad_name, adset_id, spend, leads,
// impressions, clicks, age_hours, daily?: [{ date, leads, spend }] }.
// `testingAdsets` = Set of testing adset ids.
export function decideAd(insight, cfg, testingAdsets) {
  const cpl = insight.leads > 0 ? insight.spend / insight.leads : null;
  const ctr = insight.impressions > 0 ? (insight.clicks || 0) / insight.impressions : 0;
  const recentLeads = leadsWithinRecencyWindow(insight, cfg.conversion_recency_days);
  // DELETE vs PAUSE: paused ads STILL count toward Meta's ad-per-ad-set cap, so
  // a capped ad set only unblocks when losers are deleted (Meta auto-archives;
  // historical reporting is kept). Config-selected; DELETE is the bigger
  // external write and stays behind the same DRY_RUN + approval gates.
  const kill = cfg.kill_action === 'DELETE' ? 'DELETE' : 'PAUSE';
  const base = { ad_id: insight.ad_id, ad_name: insight.ad_name, spend: insight.spend, leads: insight.leads, impressions: insight.impressions, ctr, cpl, recent_leads: recentLeads };

  if (!testingAdsets.has(String(insight.adset_id))) return { ...base, decision: 'SKIP', reason: 'NOT_TESTING' };
  // never touch an ad that isn't live (ports pruning.py NOT_ACTIVE guard)
  if (insight.effective_status && insight.effective_status !== 'ACTIVE') return { ...base, decision: 'SKIP', reason: 'NOT_ACTIVE' };
  // never re-promote (ports promote_winners.py ALREADY_PROMOTED guard)
  if (insight.promoted === true) return { ...base, decision: 'SKIP', reason: 'ALREADY_PROMOTED' };
  if ((insight.age_hours ?? 0) < cfg.min_age_hours) return { ...base, decision: 'SKIP', reason: 'GRACE_PERIOD' };
  if (insight.spend < cfg.min_spend_to_judge) return { ...base, decision: 'SKIP', reason: 'INSUFFICIENT_DATA' };

  // Hard CPA cap (the runaway-spend circuit breaker, 7/14 sync): fires before
  // EVERY keep/promote rule — a breaching ad is killed even if it converted an
  // hour ago, is _WINNER-tagged, or would promote on first conversion. With
  // zero leads the cap breaches once spend alone passes it: we have already
  // paid more than the maximum price of one conversion and got none.
  if (cfg.hard_cpa_cap != null && (cpl != null ? cpl > cfg.hard_cpa_cap : insight.spend >= cfg.hard_cpa_cap))
    return { ...base, decision: kill, reason: 'HARD_CPA_CAP', estimated_daily_spend_saved: insight.spend };

  // winners are never killed (except by the hard cap above); promotion candidates
  if (/_WINNER/.test(insight.ad_name || '')) return { ...base, decision: 'SKIP', reason: 'WINNER_TAG', promotion_candidate: true };
  // Winners-lineage (campaign-manager): promote on the FIRST conversion,
  // regardless of CPL - the reference never compares CPL to target in testing.
  // This deliberately runs BEFORE the bad_cpl check, so a converting ad (even a
  // high-CPL one) is promoted, not killed; the winners-campaign kill
  // (decideWinnerAdset) weeds high-CPL winners downstream. Only ZERO_CONV_BURN
  // (leads==0) still fires in this mode.
  if (cfg.promote_on_first_conversion && insight.leads >= 1)
    return { ...base, decision: 'SKIP', reason: 'WINNER_FIRST_CONV', promotion_candidate: true };
  if (!cfg.promote_on_first_conversion && insight.leads >= 1 && cpl <= cfg.target_cpl)
    return { ...base, decision: 'SKIP', reason: 'WINNER', promotion_candidate: true };

  // House standard (7/14 sync): ANY conversion within the recency window keeps
  // the ad alive — recency outranks CPL efficiency (Andromeda one-off cheap
  // CPAs don't repeat; volume + recency are the trustworthy signal). Only the
  // hard cap above beats this. Unreachable when insight.daily is absent
  // (recentLeads null): aggregate-only clients keep legacy behavior.
  if ((recentLeads ?? 0) >= 1)
    return { ...base, decision: 'SKIP', reason: 'RECENT_CONVERTER' };

  if (insight.leads === 0 && insight.spend >= cfg.zero_conv_kill_multiple * cfg.target_cpl)
    return { ...base, decision: kill, reason: 'ZERO_CONV_BURN', estimated_daily_spend_saved: insight.spend };
  // Only reachable for a STALE converter (window leads but none recent) or when
  // no daily rows exist — a recent converter already kept above.
  if (insight.leads >= 1 && cpl > cfg.cpl_kill_multiple * cfg.target_cpl)
    return { ...base, decision: kill, reason: 'BAD_CPL', estimated_daily_spend_saved: insight.spend };
  // CTR rule DEMOTED to a zero-conversion tiebreaker (7/14 sync): high-CTR
  // ads that never convert were soaking budget, and the old rule could kill a
  // converting ad on CTR alone. leads === 0 makes that impossible now.
  if (cfg.enable_ctr_rule && insight.leads === 0 && insight.spend >= cfg.min_spend_to_judge && ctr < cfg.min_ctr)
    return { ...base, decision: kill, reason: 'DEAD_CREATIVE', estimated_daily_spend_saved: insight.spend };

  return { ...base, decision: 'SKIP', reason: 'MONITORING' };
}

// Evaluate a batch. Returns { decisions, pauses, promotions } after applying
// the per-run caps (highest spend-saved for pauses, highest leads for promotes).
export function planRun(insights, config) {
  const cfg = optConfig(config);
  // Testing adsets = the top-level default plus every segment's testing adsets
  // (multi-segment clients). Single-segment behavior is unchanged.
  const testing = new Set([config.meta_ads?.adsets?.static, config.meta_ads?.adsets?.video].filter(Boolean).map(String));
  for (const s of config.meta_ads?.segments || [])
    for (const id of [s.adsets?.static, s.adsets?.video].filter(Boolean)) testing.add(String(id));
  const decisions = insights.map((i) => decideAd(i, cfg, testing));

  // `pauses` keeps its name for pipeline/dashboard compat but is the KILL list:
  // entries carry decision 'PAUSE' or 'DELETE' per cfg.kill_action.
  const pauses = decisions
    .filter((d) => d.decision === 'PAUSE' || d.decision === 'DELETE')
    .sort((a, b) => (b.estimated_daily_spend_saved || 0) - (a.estimated_daily_spend_saved || 0))
    .slice(0, cfg.max_pauses_per_run);

  const promotions = decisions
    .filter((d) => d.promotion_candidate)
    .sort((a, b) => b.leads - a.leads)
    .slice(0, cfg.max_promotions_per_run);

  return { decisions, pauses, kills: pauses, promotions, cfg };
}

// ---- Winners-campaign kill lineage (campaign-manager) ----------------
// The OTHER optimizer shape: it never prunes the testing adset; it kills at the
// WINNERS-campaign adset level, against a DYNAMIC running average of winners'
// CPA (not a static target) plus a multi-day stall. Pure decision only; the live
// daily-performance read + adset sunset are the adapter's job. `perf` =
// { adset_id, adset_name, cpa, conversions, daily: [{ date, cpa, spend }] }.
export function decideWinnerAdset(perf, cfg, avgCpa) {
  const base = { adset_id: perf.adset_id, adset_name: perf.adset_name, cpa: perf.cpa };
  // efficiency: sunset an adset far above the running average of winners
  if (cfg.kill_cpa_multiple_of_avg && avgCpa > 0 && perf.cpa != null && perf.cpa > cfg.kill_cpa_multiple_of_avg * avgCpa)
    return { ...base, decision: 'KILL', reason: 'EFFICIENCY', avg_cpa: avgCpa };
  // stall: N consecutive recent days each bad (no conv with spend, or CPA >= floor)
  if (cfg.kill_stall_days) {
    const recent = (perf.daily || []).slice(-cfg.kill_stall_days);
    const bad = (d) => (d.cpa == null && d.spend > 0) || (cfg.kill_cpa_floor != null && d.cpa != null && d.cpa >= cfg.kill_cpa_floor);
    if (recent.length >= cfg.kill_stall_days && recent.every(bad))
      return { ...base, decision: 'KILL', reason: 'STALL', stall_days: cfg.kill_stall_days };
  }
  return { ...base, decision: 'KEEP', reason: 'PERFORMING' };
}

// Evaluate the winners campaign: compute avg CPA across converting adsets, then
// decide each. Returns { decisions, kills, avgCpa }. `adsets` are winners-campaign
// adset perf records. Only used when the winners-kill fields are configured.
export function planWinnersKill(adsets, config) {
  const cfg = optConfig(config);
  const converting = adsets.filter((a) => a.conversions > 0 && a.cpa != null);
  // Average INCLUDES the judged adset (faithful to the reference). Consequence:
  // with 1-2 converting adsets the efficiency kill cannot fire (an adset can't
  // exceed multiple>=1 of an average it dominates) - small-N clients rely on the
  // stall kill instead. Leave-one-out would be a deliberate divergence.
  const avgCpa = converting.length ? converting.reduce((s, a) => s + a.cpa, 0) / converting.length : 0;
  const decisions = adsets.map((a) => decideWinnerAdset(a, cfg, avgCpa));
  const kills = decisions.filter((d) => d.decision === 'KILL');
  return { decisions, kills, avgCpa, cfg };
}
