import { getDb } from "@app/core";
import { googleAdsEnv, googleAdsReady } from "@app/core/ads/config";
import {
  CAMPAIGNS,
  GEO_MODIFIERS,
  NEGATIVE_LISTS,
} from "@app/core/ads/plan";
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

// Google Ads (03-google-ads-execution.md). The account plan is code in
// packages/core/src/ads/plan.ts; this page renders it alongside the
// ads_resources ledger. Nothing spends until conversion tracking fires
// (03 §0) and a human enables the PAUSED campaigns in the Google Ads UI.

interface LedgerRow {
  resource_type: string;
  plan_key: string;
  name: string;
  status: string;
  resource_name: string | null;
}

async function loadLedger(): Promise<LedgerRow[] | { error: string }> {
  try {
    const db = getDb();
    const rows = await db
      .selectFrom("ads_resources")
      .select(["resource_type", "plan_key", "name", "status", "resource_name"])
      .orderBy("resource_type")
      .orderBy("plan_key")
      .limit(500)
      .execute();
    return rows.map((row) => ({
      resource_type: row.resource_type,
      plan_key: row.plan_key,
      name: row.name,
      status: row.status,
      resource_name: row.resource_name,
    }));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "unreachable" };
  }
}

export default async function AdsPage() {
  const ledger = await loadLedger();
  const ready = googleAdsReady();
  const customerId = googleAdsEnv().GOOGLE_ADS_CUSTOMER_ID;
  const totalKeywords = CAMPAIGNS.reduce(
    (n, c) => n + c.adGroups.reduce((m, g) => m + g.keywords.length, 0),
    0,
  );
  const totalBudget = CAMPAIGNS.reduce((n, c) => n + c.monthlyBudgetUsd, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Google Ads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Account {customerId}. Plan is encoded from 03-google-ads-execution.md
          and reconciled validate-only — nothing applies without an explicit
          human --apply, and nothing spends until conversion tracking fires.
        </p>
      </div>

      {!ready && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">API access not provisioned</CardTitle>
            <CardDescription>
              Developer token and service account are pending (FDE-526). The
              reconcile job stays out of the cron manifest until then; the
              plan below is what will be created, PAUSED, once access lands.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaigns</CardTitle>
          <CardDescription>
            {CAMPAIGNS.length} campaigns · {totalKeywords} keywords · $
            {totalBudget.toLocaleString()}/mo peak (03 §2, §6.3). All created
            PAUSED; REF never launches.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Phase</TableHead>
                <TableHead className="text-right">Ad groups</TableHead>
                <TableHead className="text-right">Keywords</TableHead>
                <TableHead className="text-right">Budget/mo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {CAMPAIGNS.map((campaign) => (
                <TableRow key={campaign.key}>
                  <TableCell>
                    <span className="font-medium">{campaign.name}</span>
                    {campaign.neverLaunch && (
                      <Badge variant="secondary" className="ml-2">
                        never launch
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {campaign.phase}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {campaign.adGroups.length}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {campaign.adGroups.reduce((n, g) => n + g.keywords.length, 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ${campaign.monthlyBudgetUsd}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Shared negative lists</CardTitle>
            <CardDescription>
              Created before any campaign goes live (03 §4).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>List</TableHead>
                  <TableHead>Applies to</TableHead>
                  <TableHead className="text-right">Terms</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {NEGATIVE_LISTS.map((list) => (
                  <TableRow key={list.key}>
                    <TableCell className="font-medium">{list.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {list.appliesTo === "ALL" ? "All campaigns" : list.appliesTo.join(", ")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {list.terms.length}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Geo bid modifiers</CardTitle>
            <CardDescription>
              Layered on nationwide presence-only targeting (03 §6.2).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Modifier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {GEO_MODIFIERS.map((geo) => (
                  <TableRow key={geo.name}>
                    <TableCell>{geo.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      +{Math.round((geo.modifier - 1) * 100)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resource ledger</CardTitle>
          <CardDescription>
            What the reconciler has adopted, validated, or created in the
            account (ads_resources).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {"error" in ledger ? (
            <p className="text-sm text-muted-foreground">{ledger.error}</p>
          ) : ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing reconciled yet — run{" "}
              <code className="text-xs">npm run job:google-ads-daily</code>{" "}
              once API access lands.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Plan key</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>{row.resource_type}</TableCell>
                    <TableCell className="text-muted-foreground">{row.plan_key}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.status === "error"
                            ? "destructive"
                            : row.status === "planned"
                              ? "secondary"
                              : "default"
                        }
                      >
                        {row.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
