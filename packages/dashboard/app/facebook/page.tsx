import { listAds, listAdSets, listCampaigns } from "@app/core/fb/client";
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

const LANDINGS: Record<string, string> = {
  pd: "https://home.solutionwhere.com/professional-development?module=pd",
  enrollments: "https://home.solutionwhere.com/enrollments?module=enrollments",
  coaching: "https://home.solutionwhere.com/coaching?module=coaching",
  referrals: "https://home.solutionwhere.com/referrals?module=referrals",
};

interface LiveAd {
  id: string;
  name: string;
  status: string;
  link: string | null;
  urlTags: string | null;
}

interface LiveAdSet {
  id: string;
  name: string;
  status: string;
  campaignId: string | null;
  pixelId: string | null;
  customEventType: string | null;
  ads: LiveAd[];
}

interface LiveCampaign {
  id: string;
  name: string;
  status: string;
  objective: string | null;
  dailyBudgetUsd: number | null;
}

interface LiveAccount {
  campaigns: LiveCampaign[];
  adSets: LiveAdSet[];
}

async function loadLive(): Promise<LiveAccount | { error: string } | null> {
  if (!fbReady()) return null;
  try {
    const [campaigns, adSets, ads] = await Promise.all([
      listCampaigns(),
      listAdSets(),
      listAds(),
    ]);
    return {
      campaigns: campaigns.map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        objective: campaign.objective,
        dailyBudgetUsd: campaign.dailyBudgetUsd,
      })),
      adSets: adSets.map((set) => ({
        id: set.id,
        name: set.name,
        status: set.status,
        campaignId: set.campaignId,
        pixelId: set.pixelId,
        customEventType: set.customEventType,
        ads: ads
          .filter((ad) => ad.adSetId === set.id)
          .map((ad) => ({
            id: ad.id,
            name: ad.name,
            status: ad.status,
            link: ad.link,
            urlTags: ad.urlTags,
          })),
      })),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Meta read failed" };
  }
}

function money(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function pathOf(link: string): string {
  try {
    const url = new URL(link);
    return `${url.pathname}${url.search}`;
  } catch {
    return link;
  }
}

export default async function FacebookPage() {
  const config = loadFbConfig();
  const [account, live] = await Promise.all([loadMetaAdsAccount(), loadLive()]);
  const planSets = Object.entries(config.campaign.adSetsByModule);
  const liveOk = live && !("error" in live) ? live : null;
  const liveError = live && "error" in live ? live.error : null;
  const campaigns = liveOk?.campaigns ?? [
    {
      id: "plan",
      name: config.campaign.name,
      status: "PAUSED",
      objective: config.campaign.objective,
      dailyBudgetUsd: config.campaign.dailyBudgetUsd,
    },
  ];
  const primary = campaigns.find((campaign) => campaign.name === config.campaign.name) ?? campaigns[0];
  const adSets = liveOk
    ? liveOk.adSets
    : planSets.map(([module, name]) => ({
        id: module,
        name,
        status: "PAUSED",
        campaignId: primary?.id ?? null,
        pixelId: config.pixelId,
        customEventType: config.campaign.optimizationEvent,
        ads: [] as LiveAd[],
      }));
  const adCount = adSets.reduce((n, set) => n + set.ads.length, 0);
  const urlTags = [
    ...new Set(adSets.flatMap((set) => set.ads.map((ad) => ad.urlTags).filter(Boolean))),
  ];
  const pixels = [...new Set(adSets.map((set) => set.pixelId).filter(Boolean))];
  const events = [...new Set(adSets.map((set) => set.customEventType).filter(Boolean))];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Facebook</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {account?.name ?? "Solutionwhere - Primary"}
          {account?.id ? ` · act ${account.id}` : " · act 1094729323030580"}.
          Ads stay paused.
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaigns</CardTitle>
          <CardDescription>
            Every campaign in the ad account. {config.campaign.name} is the
            launch campaign, at {money(config.campaign.dailyBudgetUsd)} a day.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Objective</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Daily budget</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell>{campaign.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {campaign.objective ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{campaign.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {campaign.dailyBudgetUsd == null ? "—" : money(campaign.dailyBudgetUsd)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tracking</CardTitle>
          <CardDescription>
            Pixel {pixels[0] ?? config.pixelId}. Ad sets optimize on{" "}
            {events.join(", ") || config.campaign.optimizationEvent}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Where it fires</TableHead>
                <TableHead>Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Lead</TableCell>
                <TableCell className="text-muted-foreground">Demo form, pixel and server</TableCell>
                <TableCell>What the ad sets optimize on</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Schedule</TableCell>
                <TableCell className="text-muted-foreground">Calendly confirm</TableCell>
                <TableCell>Booked demo. Recorded, not the optimization event</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>qualified_demo</TableCell>
                <TableCell className="text-muted-foreground">CRM stage</TableCell>
                <TableCell>Replaces Lead after 25 in 30 days</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className="mt-4 text-sm text-muted-foreground">
            URL tags: {urlTags[0] ?? config.urlTags}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ad sets</CardTitle>
          <CardDescription>
            {adCount || 40} ads across {adSets.length} ad sets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad set</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Pixel event</TableHead>
                <TableHead>Landing</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ads</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adSets.map((set) => {
                const module = planSets.find(([, name]) => name === set.name)?.[0] ?? "";
                const links = [...new Set(set.ads.map((ad) => ad.link).filter(Boolean))];
                const landing = links[0] ?? (module ? LANDINGS[module] : null);
                return (
                  <TableRow key={set.id}>
                    <TableCell>{set.name}</TableCell>
                    <TableCell className="text-muted-foreground">{module || "—"}</TableCell>
                    <TableCell>
                      {set.customEventType ?? "—"}
                      {set.pixelId && set.pixelId !== config.pixelId ? ` · ${set.pixelId}` : ""}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {landing ? pathOf(landing) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{set.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {set.ads.length || (liveOk ? 0 : 10)}
                    </TableCell>
                  </TableRow>
                );
              })}
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
                  <TableHead>Landing</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adSets.flatMap((set) =>
                  set.ads.map((ad) => (
                    <TableRow key={ad.id}>
                      <TableCell>{ad.name}</TableCell>
                      <TableCell className="text-muted-foreground">{set.name}</TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">
                        {ad.link ? pathOf(ad.link) : "—"}
                      </TableCell>
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
