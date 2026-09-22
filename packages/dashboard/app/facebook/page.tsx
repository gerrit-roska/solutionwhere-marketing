import { getCampaign, listAds, listAdSets, listCampaigns } from "@app/core/fb/client";
import { fbReady, loadFbConfig } from "@app/core/fb/config";
import { loadMetaAdsAccount } from "@app/core/marketing/warehouse";
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

interface LiveAdSet {
  id: string;
  name: string;
  status: string;
  ads: { id: string; name: string; status: string }[];
}

interface LiveCampaign {
  id: string;
  name: string;
  status: string;
  objective: string | null;
  dailyBudgetUsd: number | null;
  adSets: LiveAdSet[];
}

async function loadLive(campaignName: string): Promise<LiveCampaign | { error: string } | null> {
  if (!fbReady()) return null;
  try {
    const campaigns = await listCampaigns();
    const match = campaigns.find((campaign) => campaign.name === campaignName);
    if (!match) return { error: `${campaignName} is not in the ad account.` };
    const [detail, adSets, ads] = await Promise.all([
      getCampaign(match.id),
      listAdSets(),
      listAds(),
    ]);
    const sets = adSets.filter((set) => set.campaignId === match.id);
    return {
      id: detail.id,
      name: detail.name,
      status: detail.status,
      objective: detail.objective,
      dailyBudgetUsd: detail.dailyBudgetUsd,
      adSets: sets.map((set) => ({
        id: set.id,
        name: set.name,
        status: set.status,
        ads: ads
          .filter((ad) => ad.adSetId === set.id)
          .map((ad) => ({ id: ad.id, name: ad.name, status: ad.status })),
      })),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Meta read failed" };
  }
}

function money(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default async function FacebookPage() {
  const config = loadFbConfig();
  const [account, live] = await Promise.all([
    loadMetaAdsAccount(),
    loadLive(config.campaign.name),
  ]);
  const planSets = Object.entries(config.campaign.adSetsByModule);
  const liveOk = live && !("error" in live) ? live : null;
  const liveError = live && "error" in live ? live.error : null;
  const budget = liveOk?.dailyBudgetUsd ?? config.campaign.dailyBudgetUsd;
  const adCount = liveOk?.adSets.reduce((n, set) => n + set.ads.length, 0) ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Facebook</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {account?.name ?? "Solutionwhere - Primary"}. One campaign budget,
          shared across the four module ad sets. Ads stay paused.
        </p>
      </div>

      {liveError ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account read failed</CardTitle>
            <CardDescription>{liveError}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {!fbReady() ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plan only in this environment</CardTitle>
            <CardDescription>
              The Facebook token is not on this service, so this page shows the
              campaign plan. The live account is read when the token is present.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Campaign</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{config.campaign.name}</p>
            <Badge variant="secondary" className="mt-2">
              {liveOk?.status ?? "PAUSED"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Daily budget</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{money(budget)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              One budget for all four ad sets.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Optimizing for</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{config.campaign.optimizationEvent}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {liveOk?.objective ?? config.campaign.objective}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ads</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {liveOk ? adCount : "40"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ten squares in each ad set.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ad sets</CardTitle>
          <CardDescription>
            {account?.id ? `act ${account.id}` : "act 1094729323030580"}
            {account?.currency ? ` · ${account.currency}` : ""}
            {account?.timezoneName ? ` · ${account.timezoneName}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad set</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ads</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(liveOk ? liveOk.adSets.map((set) => {
                const module = planSets.find(([, name]) => name === set.name)?.[0] ?? "";
                return { name: set.name, module, status: set.status, ads: set.ads.length };
              }) : planSets.map(([module, name]) => ({
                name,
                module,
                status: "PAUSED",
                ads: 10,
              }))).map((row) => (
                <TableRow key={row.name}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell className="text-muted-foreground">{row.module}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{row.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.ads}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {liveOk ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ads</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ad</TableHead>
                  <TableHead>Ad set</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liveOk.adSets.flatMap((set) =>
                  set.ads.map((ad) => (
                    <TableRow key={ad.id}>
                      <TableCell>{ad.name}</TableCell>
                      <TableCell className="text-muted-foreground">{set.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{ad.status}</Badge>
                      </TableCell>
                    </TableRow>
                  )),
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
