import { getDb } from "@app/core";
import { warehouseConfig } from "@app/core/marketing/config";
import {
  loadWarehouseOverview,
  type Ga4Channel,
  type GoogleAdsData,
  type InstantlyCampaign,
  type LoadResult,
  type MetaData,
  type SearchConsoleData,
  type WarehouseOverview,
} from "@app/core/marketing/overview";
import { loadMetaAdsAccount } from "@app/core/marketing/warehouse";
import { loadClientConfig } from "@app/core/seo/config";
import { CAMPAIGNS } from "@app/core/ads/plan";
import { loadFbConfig } from "@app/core/fb/config";
import { Database, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

interface SeoArticleRow {
  slug: string;
  title: string | null;
  status: string;
  public_url: string | null;
  published_at: Date | null;
}

interface OverviewData {
  accountsByType: { account_type: string; total: number; suppressed: number }[];
  contacts: { total: number; verified_ok: number };
  seoQueue: { status: string; total: number }[];
  seoArticles: SeoArticleRow[];
  creatives: { status: string; total: number }[];
  suppressions: number;
  alerts: { check_name: string; severity: string; subject: string; fired_at: Date }[];
}

async function loadOverview(): Promise<OverviewData | { error: string }> {
  try {
    const db = getDb();
    const accountsByType = (
      await db
        .selectFrom("accounts")
        .select((eb) => [
          "account_type",
          eb.fn.countAll().as("total"),
          eb.fn
            .sum(eb.case().when("suppressed", "=", true).then(1).else(0).end())
            .as("suppressed"),
        ])
        .groupBy("account_type")
        .execute()
    ).map((row) => ({
      account_type: row.account_type,
      total: Number(row.total),
      suppressed: Number(row.suppressed ?? 0),
    }));
    const contactsRow = await db
      .selectFrom("contacts")
      .select((eb) => [
        eb.fn.countAll().as("total"),
        eb.fn
          .sum(eb.case().when("mv_status", "=", "ok").then(1).else(0).end())
          .as("verified_ok"),
      ])
      .executeTakeFirstOrThrow();
    const seoQueue = (
      await db
        .selectFrom("seo_keywords")
        .select((eb) => ["status", eb.fn.countAll().as("total")])
        .groupBy("status")
        .execute()
    ).map((row) => ({ status: String(row.status), total: Number(row.total) }));
    const seoArticles = await db
      .selectFrom("seo_articles")
      .select(["slug", "title", "status", "public_url", "published_at"])
      .orderBy("updated_at", "desc")
      .limit(12)
      .execute();
    const creatives = (
      await db
        .selectFrom("fb_creatives")
        .select((eb) => ["status", eb.fn.countAll().as("total")])
        .groupBy("status")
        .execute()
    ).map((row) => ({ status: String(row.status), total: Number(row.total) }));
    const suppressionRow = await db
      .selectFrom("suppression_domains")
      .select((eb) => eb.fn.countAll().as("total"))
      .executeTakeFirstOrThrow();
    const alerts = await db
      .selectFrom("guardrail_alerts")
      .select(["check_name", "severity", "subject", "fired_at"])
      .where("resolved_at", "is", null)
      .orderBy("fired_at", "desc")
      .limit(10)
      .execute();
    return {
      accountsByType,
      contacts: {
        total: Number(contactsRow.total),
        verified_ok: Number(contactsRow.verified_ok ?? 0),
      },
      seoQueue,
      seoArticles,
      creatives,
      suppressions: Number(suppressionRow.total),
      alerts,
    };
  } catch (error) {
    const raw = error instanceof Error ? error.message : "database unreachable";
    const redacted = raw.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://…");
    return { error: redacted };
  }
}

const SOURCE_LABELS: Record<string, string> = {
  ga4: "Google Analytics 4",
  searchConsole: "Search Console",
  googleAds: "Google Ads",
  metaAds: "Meta Ads (business account)",
  crm: "CRM",
  instantly: "Instantly",
};

function sourceBadgeLabel(
  key: string,
  label: string,
  schema: string,
  metaAccount: Awaited<ReturnType<typeof loadMetaAdsAccount>>,
): string {
  if (!schema) return `${label} — not connected`;
  if (key === "metaAds" && metaAccount?.name) {
    const act = metaAccount.id ? ` · act ${metaAccount.id}` : "";
    return `${label} — ${metaAccount.name}${act}`;
  }
  return `${label} · ${schema}`;
}

function publishingLine(): string {
  try {
    const cms = loadClientConfig().cms;
    if (cms.type === "strapi" && cms.publicUrlPattern) {
      const collection = cms.collection ?? "articles";
      return `Strapi publishing is live for ${collection} at ${cms.publicUrlPattern}. The weekday job stays paused until the website pull request is merged.`;
    }
    if (cms.type === "strapi") return "Strapi publishing is configured.";
    if (cms.type === "none") return "Publishing is off until a CMS is set in the client config.";
    return `Publishing goes to ${cms.type}.`;
  } catch {
    return "SEO articles are stored in project Postgres.";
  }
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatMoney(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value > 0 && value < 100 ? 2 : 0,
  });
}

function loadFbLaunch(): {
  name: string;
  dailyBudgetUsd: number;
  adSets: { module: string; name: string }[];
} | null {
  try {
    const fb = loadFbConfig();
    return {
      name: fb.campaign.name,
      dailyBudgetUsd: fb.campaign.dailyBudgetUsd,
      adSets: Object.entries(fb.campaign.adSetsByModule).map(([module, name]) => ({
        module,
        name,
      })),
    };
  } catch {
    return null;
  }
}

export default async function OverviewPage() {
  const [data, warehouse, metaAccount] = await Promise.all([
    loadOverview(),
    loadWarehouseOverview(),
    loadMetaAdsAccount(),
  ]);
  const fbLaunch = loadFbLaunch();
  const sources = warehouseConfig() as unknown as Record<string, string>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Solutionwhere Marketing
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Named-account pipeline, SEO articles on Strapi, AEO panel, and
          guardrails. Paid channels stay off until conversion tracking is
          verified.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" />
            Warehouse sources
          </CardTitle>
          <CardDescription>
            Connected sources show trailing 28-day rows below. An empty
            section means the source is connected and this view has no rows
            yet. Meta is Solutionwhere - Primary, not a personal ad account.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Object.entries(SOURCE_LABELS).map(([key, label]) => (
            <Badge key={key} variant={sources[key] ? "success" : "secondary"}>
              {sourceBadgeLabel(key, label, sources[key] ?? "", metaAccount)}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <SourceSections
        warehouse={warehouse}
        seo={"error" in data ? { error: data.error } : data}
        publishing={publishingLine()}
        fbLaunch={fbLaunch}
      />

      {"error" in data ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-amber-700">
              <TriangleAlert className="h-4 w-4" />
              Database not reachable
            </CardTitle>
            <CardDescription>{data.error}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Named accounts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tabular-nums">
                  {data.accountsByType.reduce((sum, row) => sum + row.total, 0)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Contacts (verified ok)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tabular-nums">
                  {data.contacts.total}
                  <span className="ml-2 text-sm text-muted-foreground">
                    {data.contacts.verified_ok} ok
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>SEO queue</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tabular-nums">
                  {data.seoQueue.reduce((sum, row) => sum + row.total, 0)}
                  <span className="ml-2 text-sm text-muted-foreground">
                    {data.seoQueue
                      .map((row) => `${row.total} ${row.status}`)
                      .join(" · ")}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Creatives</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tabular-nums">
                  {data.creatives.reduce((sum, row) => sum + row.total, 0)}
                  <span className="ml-2 text-sm text-muted-foreground">
                    {data.creatives
                      .map((row) => `${row.total} ${row.status}`)
                      .join(" · ") || "none yet"}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Ads plan</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tabular-nums">
                  {CAMPAIGNS.length} campaigns
                  <span className="ml-2 text-sm text-muted-foreground">
                    $
                    {CAMPAIGNS.reduce((n, c) => n + c.monthlyBudgetUsd, 0).toLocaleString()}
                    /mo peak
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Suppression list</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tabular-nums">
                  {data.suppressions}
                  <span className="ml-2 text-sm text-muted-foreground">
                    domains
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Accounts by type</CardTitle>
              <CardDescription>
                Built nightly from NCES, AESA, and staff directories.
                Suppressed rows are current customers and protected domains.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.accountsByType.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing yet — run{" "}
                  <code>FORCE_SOURCE=nces npm run job:list-build-nightly</code>.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Accounts</TableHead>
                      <TableHead className="text-right">Suppressed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.accountsByType.map((row) => (
                      <TableRow key={row.account_type}>
                        <TableCell>{row.account_type}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.total}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.suppressed}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Open guardrail alerts</CardTitle>
            </CardHeader>
            <CardContent>
              {data.alerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">None open.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Check</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead className="w-44 text-right">Fired</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.alerts.map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>{row.check_name}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              row.severity === "critical"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {row.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>{row.subject}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {new Date(row.fired_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function SourceSections({
  warehouse,
  seo,
  publishing,
  fbLaunch,
}: {
  warehouse: WarehouseOverview;
  seo: OverviewData | { error: string };
  publishing: string;
  fbLaunch: {
    name: string;
    dailyBudgetUsd: number;
    adSets: { module: string; name: string }[];
  } | null;
}) {
  return (
    <>
      <SearchConsoleSection result={warehouse.searchConsole} />
      <SeoSection data={seo} publishing={publishing} />
      <GoogleAdsSection result={warehouse.googleAds} />
      <MetaSection result={warehouse.metaAds} launch={fbLaunch} />
      <InstantlySection result={warehouse.instantly} />
      <Ga4Section result={warehouse.ga4} />
      <CrmSection result={warehouse.crm} />
    </>
  );
}

function SourceCard({
  title,
  description,
  schema,
  connected,
  badge,
  children,
}: {
  title: string;
  description: string;
  schema: string;
  connected: boolean;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {title}
          <Badge variant={connected ? "success" : "secondary"}>
            {connected ? badge || schema || "connected" : "not connected"}
          </Badge>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function stateCopy(
  label: string,
  result: { status: LoadResult<unknown>["status"]; schema: string; message: string | null },
): string | null {
  if (result.status === "ok") return null;
  if (result.status === "empty") {
    return `${label} is connected (${result.schema}) but this view has no rows yet.`;
  }
  if (result.status === "not-connected") {
    return `${label} is not in the warehouse config.`;
  }
  if (result.status === "unavailable" || result.status === "error") {
    return result.message ?? "Warehouse query failed.";
  }
  return null;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function SearchConsoleSection({ result }: { result: LoadResult<SearchConsoleData> }) {
  const copy = stateCopy("Search Console", result);
  const data = result.status === "ok" ? result.data : null;
  return (
    <SourceCard
      title="Google Search Console"
      description="Page and query totals from page_report and keyword_site_report_by_site, trailing 28 days."
      schema={result.schema}
      connected={result.status !== "not-connected"}
    >
      {copy ? <p className="text-sm text-muted-foreground">{copy}</p> : null}
      {data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Metric label="Clicks" value={formatCount(data.clicks)} />
            <Metric label="Impressions" value={formatCount(data.impressions)} />
            <Metric label="Pages" value={formatCount(data.pages)} />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Page</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">Impressions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.topPages.map((row) => (
                <TableRow key={row.page}>
                  <TableCell className="max-w-md truncate">
                    <a
                      href={row.page}
                      className="underline-offset-2 hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {row.page.replace(/^https?:\/\/[^/]+/, "") || row.page}
                    </a>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(row.clicks)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(row.impressions)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Query</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">Impressions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.topQueries.map((row) => (
                <TableRow key={row.query}>
                  <TableCell>{row.query}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(row.clicks)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(row.impressions)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </SourceCard>
  );
}

function SeoSection({
  data,
  publishing,
}: {
  data: OverviewData | { error: string };
  publishing: string;
}) {
  const unreachable = "error" in data;
  return (
    <SourceCard
      title="SEO"
      description={publishing}
      schema="strapi"
      badge="Strapi"
      connected
    >
      {unreachable ? (
        <p className="text-sm text-muted-foreground">
          Database not reachable. SEO articles live in project Postgres, so
          this view cannot list them.
        </p>
      ) : data.seoArticles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Strapi publishing is configured, but this view has no articles yet.
          {data.seoQueue.length > 0
            ? ` Keyword queue: ${data.seoQueue.map((row) => `${row.total} ${row.status}`).join(", ")}.`
            : ""}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Article</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Public URL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.seoArticles.map((row) => (
              <TableRow key={row.slug}>
                <TableCell>{row.title || row.slug}</TableCell>
                <TableCell>
                  <Badge
                    variant={row.status === "published" ? "success" : "secondary"}
                  >
                    {row.status}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-xs truncate">
                  {row.public_url ? (
                    <a
                      href={row.public_url}
                      className="underline-offset-2 hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {row.public_url.replace(/^https?:\/\/[^/]+/, "")}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">/blog/{row.slug}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SourceCard>
  );
}

function GoogleAdsSection({ result }: { result: LoadResult<GoogleAdsData> }) {
  const copy = stateCopy("Google Ads", result);
  const data = result.data;
  const showRows = result.status === "ok" && data != null;
  return (
    <SourceCard
      title="Google Ads"
      description="Campaigns from campaign_history. Spend, clicks, and impressions from campaign_stats, trailing 28 days."
      schema={result.schema}
      connected={result.status !== "not-connected"}
    >
      {copy ? <p className="text-sm text-muted-foreground">{copy}</p> : null}
      {showRows && data.statsRows === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Google Ads is connected ({result.schema}) but campaign_stats has no
          delivery rows in the trailing 28 days.
        </p>
      ) : null}
      {showRows ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Metric label="Spend" value={formatMoney(data.cost)} />
            <Metric label="Clicks" value={formatCount(data.clicks)} />
            <Metric label="Impressions" value={formatCount(data.impressions)} />
            <Metric label="Conversions" value={formatCount(data.conversions)} />
          </div>
          {data.campaigns.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.campaigns.map((row) => (
                  <TableRow key={`${row.name}-${row.channel}`}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant={row.status === "ENABLED" ? "success" : "secondary"}
                      >
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.channel}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </div>
      ) : null}
    </SourceCard>
  );
}

function MetaSection({
  result,
  launch,
}: {
  result: LoadResult<MetaData>;
  launch: {
    name: string;
    dailyBudgetUsd: number;
    adSets: { module: string; name: string }[];
  } | null;
}) {
  const copy = stateCopy("Meta Ads", result);
  const data = result.status === "ok" ? result.data : null;
  return (
    <SourceCard
      title="Facebook / Meta Ads"
      description="Solutionwhere - Primary. One campaign budget, shared across the four module ad sets. Spend appears here once campaign tables sync."
      schema={result.schema}
      connected={result.status !== "not-connected"}
    >
      {copy ? <p className="text-sm text-muted-foreground">{copy}</p> : null}
      {launch ? (
        <div className="mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Campaign</p>
              <p className="text-lg font-semibold">{launch.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Daily budget</p>
              <p className="text-2xl font-semibold tabular-nums">
                {formatMoney(launch.dailyBudgetUsd)}
              </p>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad set</TableHead>
                <TableHead>Module</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {launch.adSets.map((row) => (
                <TableRow key={row.name}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell className="text-muted-foreground">{row.module}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-sm text-muted-foreground">
            Five statics per ad set, light and dark. Nothing is spending. The
            campaign is created paused when the approved squares are uploaded.
          </p>
        </div>
      ) : null}
      {data ? (
        <div className="space-y-4">
          {data.account ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{data.account.name}</span>
              {data.account.status ? (
                <Badge variant="secondary">{data.account.status}</Badge>
              ) : null}
              <span className="text-muted-foreground">
                {[
                  data.account.id ? `act ${data.account.id}` : "",
                  data.account.currency,
                  data.account.timezone,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          ) : null}
          {data.performance == null ? (
            <p className="text-sm text-muted-foreground">
              Meta Ads is connected ({result.schema}) but campaign performance
              tables are not in this warehouse schema yet.
            </p>
          ) : data.performance.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Meta Ads is connected ({result.schema}) but this view has no
              campaign rows yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Impressions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.performance.map((row) => (
                  <TableRow key={row.campaign}>
                    <TableCell>{row.campaign}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.spend)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(row.clicks)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(row.impressions)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {data.activity.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead>Actor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.activity.map((row, index) => (
                  <TableRow key={`${row.time}-${index}`}>
                    <TableCell className="text-muted-foreground">{row.time}</TableCell>
                    <TableCell>
                      {row.event}
                      {row.objectName ? ` — ${row.objectName}` : ""}
                    </TableCell>
                    <TableCell>{row.actor}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </div>
      ) : null}
    </SourceCard>
  );
}

function InstantlySection({ result }: { result: LoadResult<InstantlyCampaign[]> }) {
  const copy = stateCopy("Instantly", result);
  const rows = result.status === "ok" ? result.data : null;
  return (
    <SourceCard
      title="Instantly"
      description="Campaign analytics: contacted, sent, unique replies, bounces, and unsubscribes."
      schema={result.schema}
      connected={result.status !== "not-connected"}
    >
      {copy ? <p className="text-sm text-muted-foreground">{copy}</p> : null}
      {rows ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead className="text-right">Contacted</TableHead>
              <TableHead className="text-right">Sent</TableHead>
              <TableHead className="text-right">Replies</TableHead>
              <TableHead className="text-right">Bounced</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.name}>
                <TableCell>{row.name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(row.contacted)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(row.sent)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(row.replies)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(row.bounced)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </SourceCard>
  );
}

function Ga4Section({ result }: { result: LoadResult<Ga4Channel[]> }) {
  const copy = stateCopy("Google Analytics 4", result);
  const rows = result.status === "ok" ? result.data : null;
  const sessions = rows?.reduce((sum, row) => sum + row.sessions, 0) ?? 0;
  const keyEvents = rows?.reduce((sum, row) => sum + row.keyEvents, 0) ?? 0;
  return (
    <SourceCard
      title="Google Analytics 4"
      description="Sessions and key events by source and medium from traffic_acquisition_session_source_medium_report, trailing 28 days."
      schema={result.schema}
      connected={result.status !== "not-connected"}
    >
      {copy ? <p className="text-sm text-muted-foreground">{copy}</p> : null}
      {rows ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Metric label="Sessions" value={formatCount(sessions)} />
            <Metric label="Key events" value={formatCount(keyEvents)} />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Medium</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">Key events</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.source}-${row.medium}`}>
                  <TableCell>{row.source}</TableCell>
                  <TableCell>{row.medium}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(row.sessions)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(row.keyEvents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </SourceCard>
  );
}

function CrmSection({
  result,
}: {
  result: WarehouseOverview["crm"];
}) {
  const copy = stateCopy("CRM", result);
  const rows = result.status === "ok" ? result.data : null;
  return (
    <SourceCard
      title="CRM"
      description="Open pipeline by module from the CRM warehouse schema. Nothing is connected until warehouse.json names a schema."
      schema={result.schema}
      connected={result.status !== "not-connected"}
    >
      {copy ? <p className="text-sm text-muted-foreground">{copy}</p> : null}
      {result.note ? (
        <p className="mt-2 text-sm text-muted-foreground">{result.note}</p>
      ) : null}
      {rows ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Module</TableHead>
              <TableHead className="text-right">Open amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.module}>
                <TableCell>{row.module}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(row.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </SourceCard>
  );
}
