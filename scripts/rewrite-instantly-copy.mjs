// One-shot Instantly sequence rewrite for Solutionwhere.
// Reads data/sequences.json (local) or SEQUENCES_URL (graphed exec).
// PATCHes sequences only. Does not activate campaigns.

const BASE = "https://api.instantly.ai/api/v2";
const MONTH = "2026-09";
const MODULE_LABEL = {
  pd: "PD",
  enrollments: "Enrollments",
  coaching: "Coaching",
  referrals: "Referrals",
  cross_sell: "Cross-sell",
};

function campaignName(module) {
  return `SW | ${MODULE_LABEL[module] ?? module} | template | ${MONTH}`;
}

function toInstantlyBody(body) {
  return body
    .replaceAll("{{first_name}}", "{{firstName}}")
    .replaceAll("{{account_name}}", "{{companyName}}")
    .replaceAll("CCR&R", "CCR and R");
}

function assertCleanCopy(seq) {
  const text = JSON.stringify(seq.steps);
  if (/[—–]/.test(text)) throw new Error(`em/en dash in ${seq.id}`);
  if (/231-935-3000|\+1 ?231/.test(text)) {
    throw new Error(`phone number in ${seq.id}`);
  }
}

function sequencePayload(seq) {
  return [
    {
      steps: seq.steps.map((step) => ({
        type: "email",
        delay: step.delay,
        delay_unit: "days",
        variants: step.variants.map((variant) => ({
          subject: variant.subject,
          body: toInstantlyBody(variant.body),
        })),
      })),
    },
  ];
}

async function instantly(path, init = {}) {
  const key = process.env.INSTANTLY_API_KEY;
  if (!key) throw new Error("INSTANTLY_API_KEY is not set");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Instantly ${init.method ?? "GET"} ${path} ${res.status}: ${text.slice(0, 800)}`);
  }
  return text ? JSON.parse(text) : {};
}

async function listCampaigns() {
  const items = [];
  let startingAfter;
  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (startingAfter) query.set("starting_after", startingAfter);
    const body = await instantly(`/campaigns?${query}`);
    items.push(...(body.items ?? []));
    if (!body.next_starting_after) break;
    startingAfter = body.next_starting_after;
  }
  return items;
}

function summarize(campaign) {
  const seq = campaign.sequences?.[0];
  const steps = seq?.steps ?? [];
  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    delays: steps.map((s) => s.delay),
    variants: steps.map((s) => (s.variants ?? []).length),
    subjects: steps.map((s) => (s.variants ?? []).map((v) => v.subject)),
    body_chars: steps.map((s) =>
      (s.variants ?? []).map((v) => String(v.body ?? "").length),
    ),
    has_em_dash: JSON.stringify(steps).includes("\u2014") || JSON.stringify(steps).includes("\u2013"),
    has_phone: /231-935-3000/.test(JSON.stringify(steps)),
  };
}

async function loadSequences() {
  if (process.env.SEQUENCES_URL) {
    const res = await fetch(process.env.SEQUENCES_URL);
    if (!res.ok) throw new Error(`SEQUENCES_URL ${res.status}`);
    return res.json();
  }
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  return JSON.parse(readFileSync(resolve("data/sequences.json"), "utf-8"));
}

async function main() {
  const file = await loadSequences();
  const campaigns = await listCampaigns();
  const byName = new Map(campaigns.map((c) => [c.name, c]));
  const upserts = [];

  for (const seq of file.sequences) {
    assertCleanCopy(seq);
    const name = campaignName(seq.module);
    const existing = byName.get(name);
    if (!existing) {
      upserts.push({ action: "missing", name });
      continue;
    }
    await instantly(`/campaigns/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        sequences: sequencePayload(seq),
        text_only: true,
        first_email_text_only: true,
      }),
    });
    const fresh = await instantly(`/campaigns/${existing.id}`);
    if (fresh.status === 1) {
      await instantly(`/campaigns/${existing.id}/pause`, { method: "POST" });
    }
    upserts.push({ action: "patched", ...summarize(fresh) });
  }

  console.log(JSON.stringify({ upserts }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
