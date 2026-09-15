import { getDb } from "@app/core";
import { presignGet } from "@app/core/marketing/storage";
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

// Creative review (04-meta-ads-execution.md §5). The factory's output,
// newest first, with presigned links into project storage. Every asset is
// reviewed here before anything is uploaded — drafts enter PAUSED and a
// human activates (04 §6).

interface CreativeRow {
  creative_id: string;
  persona: string;
  angle: string;
  module: string;
  format: string;
  headline: string | null;
  primary_text: string | null;
  status: string;
  file_key: string | null;
  url: string | null;
  created_at: string;
}

async function load(): Promise<CreativeRow[] | { error: string }> {
  try {
    const db = getDb();
    const rows = await db
      .selectFrom("fb_creatives")
      .selectAll()
      .orderBy("created_at", "desc")
      .limit(100)
      .execute();
    return await Promise.all(
      rows.map(async (row) => ({
        creative_id: row.creative_id,
        persona: row.persona,
        angle: row.angle,
        module: row.module,
        format: row.format,
        headline: row.headline,
        primary_text: row.primary_text,
        status: row.status,
        file_key: row.file_key,
        url: row.file_key ? await presignGet(row.file_key, 3600) : null,
        created_at: new Date(row.created_at).toISOString().slice(0, 16).replace("T", " "),
      })),
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : "unreachable" };
  }
}

export default async function CreativePage() {
  const data = await load();
  const count = Array.isArray(data) ? data.length : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Creative</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Meta Andromeda factory output, tagged persona × angle. Review here
          before upload — nothing reaches Meta until the Business Manager
          assets land and drafts are approved.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generated assets</CardTitle>
          <CardDescription>
            {count} asset{count === 1 ? "" : "s"} generated. Weekly factory
            target is 100+ once the loop is live (04 §5).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {"error" in data ? (
            <p className="text-sm text-muted-foreground">{data.error}</p>
          ) : data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing generated yet — run{" "}
              <code className="text-xs">
                npm run job:fb-creative-factory-weekly -- --review
              </code>{" "}
              for the first review batch.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Creative</TableHead>
                  <TableHead>Persona</TableHead>
                  <TableHead>Angle</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Headline</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Asset</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.creative_id}>
                    <TableCell className="font-medium">{row.creative_id}</TableCell>
                    <TableCell>{row.persona}</TableCell>
                    <TableCell>{row.angle}</TableCell>
                    <TableCell>{row.format}</TableCell>
                    <TableCell className="max-w-64 truncate">{row.headline}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === "generated" ? "secondary" : "default"}>
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.url ? (
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-blue-400 underline"
                        >
                          view
                        </a>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
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
