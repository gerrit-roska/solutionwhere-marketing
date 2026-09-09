import type { Generated } from "kysely";
import type {
  SeoArticlesTable,
  SeoKeywordsTable,
  SeoPlaybooksTable,
} from "../seo/tables";

export interface ExampleHeartbeatsTable {
  id: Generated<number>;
  message: string;
  created_at: Generated<Date>;
}

// --- Marketing tables (0002_marketing.ts) ---

export type AccountType =
  | "district"
  | "esa"
  | "ccrr"
  | "head_start"
  | "sea"
  | "cmo"
  | "county_network";

export type ModuleSegment = "pd" | "enrollments" | "coaching" | "referrals";

export interface AccountsTable {
  account_id: Generated<string>;
  account_name: string;
  account_type: AccountType;
  normalized_name: string;
  domain: string | null;
  website: string | null;
  state: string;
  city: string | null;
  county: string | null;
  nces_leaid: string | null;
  enrollment: number | null;
  member_districts: number | null;
  service_area: string | null;
  host_org: string | null;
  agency_term: string | null;
  modules_fit: Generated<string[]>;
  priority_tier: Generated<number>;
  state_credit_system: string | null;
  source: string;
  source_url: string | null;
  suppressed: Generated<boolean>;
  suppression_reason: string | null;
  first_seen: Generated<Date>;
  last_verified: Date | string | null;
}

export interface ContactsTable {
  contact_id: Generated<string>;
  account_id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  title_rank: number | null;
  module_segment: ModuleSegment | null;
  email: string | null;
  email_source: string | null;
  mv_status: string | null;
  mv_verified_at: Date | string | null;
  phone: string | null;
  linkedin_url: string | null;
  sequence_id: string | null;
  sequence_status: Generated<string>;
  first_sent_at: Date | null;
  replied_at: Date | null;
  suppressed: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface SuppressionDomainsTable {
  domain: string;
  reason: string;
  source: string | null;
  added_date: Generated<Date>;
}

export interface SourceRunsTable {
  id: Generated<number>;
  source: string;
  started_at: Generated<Date>;
  finished_at: Date | null;
  rows_seen: number | null;
  rows_new: number | null;
  rows_updated: number | null;
  error: string | null;
}

export interface VerificationBatchesTable {
  id: Generated<number>;
  storage_key: string;
  tool_run_id: string | null;
  email_count: number;
  status: Generated<string>;
  billed_credits: string | number | null;
  created_at: Generated<Date>;
  completed_at: Date | null;
}

export interface OfflineConversionUploadsTable {
  id: Generated<number>;
  crm_deal_id: string;
  conversion_name: string;
  gclid: string;
  conversion_time: Date;
  conversion_value: string | number;
  uploaded_at: Date | null;
  upload_error: string | null;
}

export interface AeoResultsTable {
  id: Generated<number>;
  run_date: Date | string;
  model: string;
  prompt_id: number;
  prompt: string;
  mentioned: boolean;
  cited: boolean;
  position: number | null;
  competitors_named: string[];
  raw_response: string | null;
}

export interface RfpSignalsTable {
  id: Generated<number>;
  account_id: string | null;
  source: string;
  title: string;
  url: string;
  matched_keyword: string | null;
  posted_date: Date | string | null;
  due_date: Date | string | null;
  seen_at: Generated<Date>;
  alerted_at: Date | null;
}

export interface KeywordVolumesTable {
  id: Generated<number>;
  keyword: string;
  pulled_on: Date | string;
  provider: string;
  data_source: string | null;
  volume: number;
  cpc_usd: string | number | null;
  competition: string | number | null;
  trend_12mo: number[] | null;
  seed: string | null;
  source: string | null;
  cluster: string | null;
}

export interface GuardrailAlertsTable {
  id: Generated<number>;
  check_name: string;
  severity: "info" | "warn" | "critical";
  subject: string;
  detail: unknown;
  fired_at: Generated<Date>;
  resolved_at: Date | null;
}

// The single source of truth for table types — dashboard pages and jobs both
// query through this. Add a row type per migration (plugins do this too).
// (Applied migrations are tracked in kysely's own kysely_migration table,
// which is intentionally not part of this schema.)
export interface Database {
  example_heartbeats: ExampleHeartbeatsTable;
  accounts: AccountsTable;
  contacts: ContactsTable;
  suppression_domains: SuppressionDomainsTable;
  source_runs: SourceRunsTable;
  verification_batches: VerificationBatchesTable;
  offline_conversion_uploads: OfflineConversionUploadsTable;
  aeo_results: AeoResultsTable;
  rfp_signals: RfpSignalsTable;
  keyword_volumes: KeywordVolumesTable;
  guardrail_alerts: GuardrailAlertsTable;
  seo_keywords: SeoKeywordsTable;
  seo_articles: SeoArticlesTable;
  seo_playbooks: SeoPlaybooksTable;
}
