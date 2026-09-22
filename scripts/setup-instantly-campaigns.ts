import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CAMPAIGN_STATUS,
  checkDfyDomainAvailability,
  createCampaign,
  listAccounts,
  listCampaigns,
  listDfyOrderedAccounts,
  listDfyOrders,
  patchCampaign,
  pauseCampaign,
} from "../packages/core/src/email/instantly";
import { projectRoot } from "../packages/core/src/config";

// Pushes data/sequences.json into Instantly as paused template campaigns
// (docs/06 §5–§6). Does not activate, does not attach mailboxes, does not
// place DFY orders (those charge the Instantly card).

const MONTH = "2026-09";

interface SequenceVariant {
  subject: string;
  body: string;
}

interface SequenceStep {
  delay: number;
  variants: SequenceVariant[];
}

interface SequenceFile {
  sequences: Array<{
    id: string;
    module: string;
    name: string;
    steps: SequenceStep[];
  }>;
}

const MODULE_LABEL: Record<string, string> = {
  pd: "PD",
  enrollments: "Enrollments",
  coaching: "Coaching",
  referrals: "Referrals",
  cross_sell: "Cross-sell",
};

function campaignName(module: string): string {
  const label = MODULE_LABEL[module] ?? module;
  return `SW | ${label} | template | ${MONTH}`;
}

function toInstantlyBody(body: string): string {
  // Instantly text_only campaigns drop HTML text and keep only <br/>.
  // Send real newlines so the editor and the mailbox both get the copy.
  return body
    .replaceAll("{{first_name}}", "{{firstName}}")
    .replaceAll("{{account_name}}", "{{companyName}}")
    .replaceAll("CCR&R", "CCR and R");
}

function assertCleanCopy(seq: SequenceFile["sequences"][number]): void {
  const text = JSON.stringify(seq);
  if (/[—–]/.test(text)) {
    throw new Error(`em/en dash in sequence ${seq.id}`);
  }
  if (/231-935-3000|\+1 ?231/.test(text)) {
    throw new Error(`phone number in sequence ${seq.id}`);
  }
}

function sequencePayload(seq: SequenceFile["sequences"][number]) {
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

function campaignPayload(seq: SequenceFile["sequences"][number]) {
  return {
    name: campaignName(seq.module),
    campaign_schedule: {
      schedules: [
        {
          name: "Tue-Thu morning ET",
          timing: { from: "07:30", to: "09:00" },
          days: {
            "0": false,
            "1": false,
            "2": true,
            "3": true,
            "4": true,
            "5": false,
            "6": false,
          },
          timezone: "America/Detroit",
        },
      ],
    },
    sequences: sequencePayload(seq),
    text_only: true,
    first_email_text_only: true,
    open_tracking: false,
    link_tracking: false,
    stop_on_reply: true,
    stop_on_auto_reply: true,
    stop_for_company: true,
    insert_unsubscribe_header: false,
    allow_risky_contacts: false,
    disable_bounce_protect: false,
    daily_limit: 25,
    daily_max_leads: 25,
    email_gap: 1,
    random_wait_max: 2,
    is_evergreen: false,
    limit_emails_per_company_override: {
      mode: "custom",
      daily_limit: 1,
      scope: "per_campaign",
    },
  };
}

async function optional<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`skip ${label}: ${message.slice(0, 240)}`);
    return null;
  }
}

async function main(): Promise<void> {
  const root = projectRoot();
  const file = JSON.parse(
    readFileSync(resolve(root, "data/sequences.json"), "utf-8"),
  ) as SequenceFile;

  const [campaigns, accounts, dfyOrders, dfyAccounts, domainCheck] =
    await Promise.all([
      listCampaigns(),
      listAccounts(),
      optional("dfy-orders", listDfyOrders),
      optional("dfy-accounts", listDfyOrderedAccounts),
      optional("dfy-domain-check", () =>
        checkDfyDomainAvailability(["getsolutionwhere.com"]),
      ),
    ]);

  console.log(
    JSON.stringify(
      {
        accounts: accounts.map((a) => ({
          email: a.email,
          status: a.status,
          warmup_status: a.warmup_status,
          provider: a.provider,
        })),
        dfy_orders: dfyOrders,
        dfy_accounts: dfyAccounts,
        dfy_domain_check: domainCheck,
        existing_campaigns: campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          status: CAMPAIGN_STATUS[c.status] ?? c.status,
          email_list: c.email_list ?? [],
        })),
      },
      null,
      2,
    ),
  );

  const byName = new Map(campaigns.map((c) => [c.name, c]));
  const upserts: Array<Record<string, unknown>> = [];

  for (const seq of file.sequences) {
    assertCleanCopy(seq);
    const name = campaignName(seq.module);
    const existing = byName.get(name);
    if (existing) {
      const patched = await patchCampaign(existing.id, {
        sequences: sequencePayload(seq),
        text_only: true,
        first_email_text_only: true,
      });
      let final = patched;
      if (patched.status === 1) {
        final = await pauseCampaign(patched.id);
      }
      upserts.push({
        action: "patched",
        id: final.id,
        name,
        status: CAMPAIGN_STATUS[final.status] ?? final.status,
        steps: seq.steps.length,
      });
      continue;
    }

    const created = await createCampaign(campaignPayload(seq));
    let final = created;
    if (created.status === 1) {
      final = await pauseCampaign(created.id);
    }
    upserts.push({
      action: "created",
      id: final.id,
      name: final.name,
      status: CAMPAIGN_STATUS[final.status] ?? final.status,
      steps: seq.steps.length,
    });
  }

  console.log(JSON.stringify({ upserts }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
