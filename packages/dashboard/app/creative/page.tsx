import { getDb } from "@app/core";
import { presignGet } from "@app/core/marketing/storage";
import { loadMetaAdsAccount } from "@app/core/marketing/warehouse";
import { Check, X } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { approveCreativeAction, rejectCreativeAction } from "./actions";
import { ReviewVideo } from "./review-video";

export const dynamic = "force-dynamic";

// Creative review (04-meta-ads-execution.md §5). The factory's output as
// horizontal review cards — media left, copy and approve/reject right.
// Every asset is reviewed here before anything is uploaded: drafts enter
// Meta PAUSED and a human activates (04 §6).

interface CreativeRow {
  creative_id: string;
  persona: string;
  angle: string;
  module: string;
  format: string;
  headline: string | null;
  primary_text: string | null;
  status: string;
  url: string | null;
  created_at: string;
}

const TABS = [
  { key: "all", label: "All" },
  { key: "generated", label: "Pending review" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
] as const;

type CreativeTab = (typeof TABS)[number]["key"];

async function load(
  tab: CreativeTab,
): Promise<{ rows: CreativeRow[]; counts: Record<string, number> } | { error: string }> {
  try {
    const db = getDb();
    const countRows = await db
      .selectFrom("fb_creatives")
      .select((eb) => ["status", eb.fn.countAll().as("total")])
      .groupBy("status")
      .execute();
    const counts: Record<string, number> = {};
    for (const row of countRows) counts[row.status] = Number(row.total);

    let query = db
      .selectFrom("fb_creatives")
      .selectAll()
      .orderBy("created_at", "desc")
      .limit(100);
    if (tab !== "all") query = query.where("status", "=", tab);
    const rows = await query.execute();

    return {
      counts,
      rows: await Promise.all(
        rows.map(async (row) => ({
          creative_id: row.creative_id,
          persona: row.persona,
          angle: row.angle,
          module: row.module,
          format: row.format,
          headline: row.headline,
          primary_text: row.primary_text,
          status: row.status,
          url: row.file_key ? await presignGet(row.file_key, 3600) : null,
          created_at: new Date(row.created_at)
            .toISOString()
            .slice(0, 16)
            .replace("T", " "),
        })),
      ),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "unreachable" };
  }
}

function statusVariant(status: string): "secondary" | "success" | "destructive" | "default" {
  if (status === "generated") return "secondary";
  if (status === "approved") return "success";
  if (status === "rejected") return "destructive";
  return "default";
}

export default async function CreativePage({
  searchParams,
}: {
  searchParams: { tab?: string; notice?: string; error?: string };
}) {
  const tab: CreativeTab = TABS.some((t) => t.key === searchParams.tab)
    ? (searchParams.tab as CreativeTab)
    : "all";
  const data = await load(tab);
  const metaAccount = await loadMetaAdsAccount();
  const metaLabel = metaAccount?.name
    ? `${metaAccount.name}${metaAccount.id ? ` · act ${metaAccount.id}` : ""}`
    : metaAccount?.schema ?? "not connected";

  const counts = "error" in data ? {} : data.counts;
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const tiles = [
    { label: "Pending review", value: counts.generated ?? 0 },
    { label: "Approved", value: counts.approved ?? 0 },
    { label: "Rejected", value: counts.rejected ?? 0 },
    { label: "Total generated", value: total },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Creative</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Meta Andromeda factory output, tagged persona × angle. Warehouse is{" "}
            {metaLabel}. Review here before upload — drafts stay PAUSED until a
            human activates.
          </p>
        </div>
        <nav className="inline-flex items-center gap-1 rounded-md bg-muted p-1">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.key === "all" ? "/creative" : `/creative?tab=${t.key}`}
              className={
                t.key === tab
                  ? "rounded-sm bg-background px-3 py-1 text-xs font-medium shadow-sm"
                  : "rounded-sm px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              }
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      {searchParams.error ? (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {searchParams.error}
        </p>
      ) : null}
      {searchParams.notice ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
          {searchParams.notice}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {tile.label}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
                {tile.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {"error" in data ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base text-amber-700">
              Creative table not reachable
            </CardTitle>
            <CardDescription>{data.error}</CardDescription>
          </CardHeader>
        </Card>
      ) : data.rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {tab === "all"
              ? "Nothing generated yet — run `npm run job:fb-creative-factory-weekly -- --review` for the first review batch."
              : `No creatives with status "${tab}".`}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.rows.map((row) => (
            <Card key={row.creative_id} className="overflow-hidden">
              <div className="flex flex-col sm:flex-row">
                <div className="flex h-48 w-full items-center justify-center bg-muted sm:h-auto sm:w-64 sm:shrink-0">
                  {row.url && row.format === "video" ? (
                    <ReviewVideo src={row.url} />
                  ) : row.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.url}
                      alt={row.headline ?? row.creative_id}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      no asset stored
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                    <Badge variant="secondary">{row.format}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {row.persona} · {row.angle} · {row.module}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {row.created_at}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium leading-snug">{row.headline}</p>
                    <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
                      {row.primary_text}
                    </p>
                  </div>
                  <div className="mt-auto flex items-center gap-2 pt-1">
                    <span className="font-mono text-xs text-muted-foreground">
                      {row.creative_id}
                    </span>
                    {row.status === "generated" ? (
                      <div className="ml-auto flex gap-2">
                        <form action={approveCreativeAction}>
                          <input type="hidden" name="creativeId" value={row.creative_id} />
                          <input type="hidden" name="tab" value={tab} />
                          <Button type="submit" size="sm" variant="outline">
                            <Check className="mr-1 h-4 w-4" />
                            Approve
                          </Button>
                        </form>
                        <form action={rejectCreativeAction}>
                          <input type="hidden" name="creativeId" value={row.creative_id} />
                          <input type="hidden" name="tab" value={tab} />
                          <Button type="submit" size="sm" variant="outline" className="text-destructive">
                            <X className="mr-1 h-4 w-4" />
                            Reject
                          </Button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
