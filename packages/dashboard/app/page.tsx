import { getDb } from "@app/core";
import { warehouseConfig } from "@app/core/marketing/config";
import { Database, TriangleAlert } from "lucide-react";

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

interface OverviewData {
  accountsByType: { account_type: string; total: number; suppressed: number }[];
  contacts: { total: number; verified_ok: number };
  seoQueue: { status: string; total: number }[];
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
      alerts,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "database unreachable",
    };
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

export default async function OverviewPage() {
  const data = await loadOverview();
  const sources = warehouseConfig() as unknown as Record<string, string>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Solutionwhere Marketing
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Named-account pipeline, SEO drafts, AEO panel, and guardrails. Paid
          channels stay off until conversion tracking is verified.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" />
            Warehouse sources
          </CardTitle>
          <CardDescription>
            Tiles below light up as the client grants access and sources are
            connected (see the onboarding packet).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Object.entries(SOURCE_LABELS).map(([key, label]) => (
            <Badge key={key} variant={sources[key] ? "success" : "secondary"}>
              {label}
              {sources[key] ? "" : " — not connected"}
            </Badge>
          ))}
        </CardContent>
      </Card>

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
          <div className="grid grid-cols-3 gap-4">
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
