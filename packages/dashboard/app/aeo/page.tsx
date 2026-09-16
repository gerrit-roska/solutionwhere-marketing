import { getDb } from "@app/core";
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

// AEO panel results: mentioned-out-of-20 by model by month, plus the latest
// run's per-prompt detail. Data comes from the aeo-panel-monthly job (and,
// later, manual entries logged as model = "manual:<product>").

interface SummaryRow {
  run_date: string;
  model: string;
  mentioned: number;
  cited: number;
  prompts: number;
}

async function load(): Promise<{
  summary: SummaryRow[];
  latest: { prompt: string; model: string; mentioned: boolean; cited: boolean; competitors_named: string[] }[];
} | { error: string }> {
  try {
    const db = getDb();
    const rows = await db
      .selectFrom("aeo_results")
      .select((eb) => [
        "run_date",
        "model",
        eb.fn.countAll().as("prompts"),
        eb.fn.sum(eb.case().when("mentioned", "=", true).then(1).else(0).end()).as("mentioned"),
        eb.fn.sum(eb.case().when("cited", "=", true).then(1).else(0).end()).as("cited"),
      ])
      .groupBy(["run_date", "model"])
      .orderBy("run_date", "desc")
      .execute();
    const summary = rows.map((row) => ({
      // pg returns DATE as a JS Date; String(Date).slice(0,10) yields
      // "Wed Sep 16", which Postgres then rejects on the detail query.
      run_date:
        row.run_date instanceof Date
          ? row.run_date.toISOString().slice(0, 10)
          : String(row.run_date).slice(0, 10),
      model: row.model,
      mentioned: Number(row.mentioned ?? 0),
      cited: Number(row.cited ?? 0),
      prompts: Number(row.prompts),
    }));
    const latestDate = summary[0]?.run_date;
    const latest = latestDate
      ? await db
          .selectFrom("aeo_results")
          .select(["prompt", "model", "mentioned", "cited", "competitors_named"])
          .where("run_date", "=", latestDate)
          .orderBy("prompt_id")
          .execute()
      : [];
    return { summary, latest };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "unreachable" };
  }
}

export default async function AeoPage() {
  const data = await load();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI search presence</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The 20-prompt panel across four models, monthly. Targets: 4/20
          mentioned by month 3, 8/20 by month 6, 14/20 (6 cited) by month 12.
        </p>
      </div>

      {"error" in data ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No data</CardTitle>
            <CardDescription>{data.error}</CardDescription>
          </CardHeader>
        </Card>
      ) : data.summary.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No runs yet</CardTitle>
            <CardDescription>
              Run the baseline: <code>graphed jobs run aeo-panel-monthly</code>{" "}
              (or locally under <code>graphed dev run</code>).
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mentioned / cited by run</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Run</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Mentioned</TableHead>
                    <TableHead className="text-right">Cited</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.summary.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell>{row.run_date}</TableCell>
                      <TableCell>{row.model}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.mentioned}/{row.prompts}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.cited}/{row.prompts}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Latest run detail</CardTitle>
              <CardDescription>
                Prompts 16, 17, and 20 are the canaries: if a model cannot
                answer "What is Wisdomwhere?", fix the on-site foundation
                first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prompt</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Mentioned</TableHead>
                    <TableHead>Competitors named</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.latest.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell className="max-w-72 truncate">{row.prompt}</TableCell>
                      <TableCell>{row.model.split("/")[1] ?? row.model}</TableCell>
                      <TableCell>{row.mentioned ? (row.cited ? "cited" : "yes") : "—"}</TableCell>
                      <TableCell className="max-w-64 truncate text-muted-foreground">
                        {row.competitors_named.join(", ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
