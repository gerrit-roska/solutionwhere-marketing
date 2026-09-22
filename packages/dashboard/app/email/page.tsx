import { getDb } from "@app/core";
import { warehouseConfig } from "@app/core/marketing/config";
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

// Cold-email coverage: named-account coverage by state and tier from project
// Postgres. Campaign analytics (sends, replies, bounces vs the 2% line)
// light up once the Instantly source is connected.

interface CoverageRow {
  state: string;
  priority_tier: number;
  accounts: number;
  with_contact: number;
  sequenced: number;
}

async function load(): Promise<CoverageRow[] | { error: string }> {
  try {
    const db = getDb();
    const rows = await db
      .selectFrom("accounts")
      .leftJoin("contacts", "contacts.account_id", "accounts.account_id")
      .select((eb) => [
        "accounts.state",
        "accounts.priority_tier",
        eb.fn.count("accounts.account_id").distinct().as("accounts"),
        eb.fn.count("contacts.contact_id").as("with_contact"),
        eb.fn
          .sum(
            eb
              .case()
              .when("contacts.first_sent_at", "is not", null)
              .then(1)
              .else(0)
              .end(),
          )
          .as("sequenced"),
      ])
      .where("accounts.suppressed", "=", false)
      .groupBy(["accounts.state", "accounts.priority_tier"])
      .orderBy("accounts.priority_tier")
      .orderBy("accounts.state")
      .limit(200)
      .execute();
    return rows.map((row) => ({
      state: row.state,
      priority_tier: row.priority_tier,
      accounts: Number(row.accounts),
      with_contact: Number(row.with_contact),
      sequenced: Number(row.sequenced ?? 0),
    }));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "unreachable" };
  }
}

async function loadSuppressions(): Promise<number> {
  try {
    const row = await getDb()
      .selectFrom("suppression_domains")
      .select((eb) => eb.fn.countAll().as("total"))
      .executeTakeFirstOrThrow();
    return Number(row.total);
  } catch {
    return 0;
  }
}

export default async function EmailPage() {
  const data = await load();
  const suppressions = await loadSuppressions();
  const instantlyConnected = Boolean(warehouseConfig().instantly);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cold email</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Named-account coverage by state and tier. Sending is gated on
          domains warming, the suppression list, and explicit approval.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Emails are warming</CardTitle>
          <CardDescription>
            The sending domains are still in warm-up. Nothing goes out until
            that finishes and a send is approved.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Suppression list</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">
              {suppressions}
              <span className="ml-2 text-sm text-muted-foreground">
                domains
              </span>
            </div>
            {suppressions === 0 ? (
              <p className="mt-1 text-xs text-amber-700">
                Nothing sends until the customer suppression list is loaded
                (06 §1).
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sequencer</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {instantlyConnected ? "Connected" : "Not connected"}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {instantlyConnected
                ? "Instantly source live — campaign analytics below."
                : "Instantly/Smartlead account is a client checklist item."}
            </p>
          </CardContent>
        </Card>
      </div>

      {!instantlyConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sequencer not connected</CardTitle>
            <CardDescription>
              Campaign analytics (sends, replies, bounce rate vs the 2% hard
              line) appear here once the Instantly source is connected and its
              schema is set in clients/solutionwhere/warehouse.json.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coverage by state and tier</CardTitle>
        </CardHeader>
        <CardContent>
          {"error" in data ? (
            <p className="text-sm text-muted-foreground">{data.error}</p>
          ) : data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No accounts yet — the nightly list build populates this.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Tier</TableHead>
                  <TableHead className="text-right">Accounts</TableHead>
                  <TableHead className="text-right">Contacts found</TableHead>
                  <TableHead className="text-right">Sequenced</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>{row.state}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.priority_tier}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.accounts}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.with_contact}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.sequenced}</TableCell>
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
