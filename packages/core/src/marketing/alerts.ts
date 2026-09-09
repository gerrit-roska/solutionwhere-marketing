import { getDb } from "../db";
import { alertsEnv } from "./config";

export type Severity = "info" | "warn" | "critical";

/** Writes a guardrail_alerts row and posts to Slack when a webhook is set. */
export async function fireAlert(
  checkName: string,
  severity: Severity,
  subject: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await getDb()
    .insertInto("guardrail_alerts")
    .values({ check_name: checkName, severity, subject, detail: JSON.stringify(detail) })
    .execute();
  await postSlack(
    `[${severity.toUpperCase()}] ${checkName} — ${subject}\n${JSON.stringify(detail)}`,
  );
}

/** Best-effort Slack post; logs to stdout when no webhook is configured. */
export async function postSlack(text: string): Promise<void> {
  const { SLACK_WEBHOOK_URL } = alertsEnv();
  if (!SLACK_WEBHOOK_URL) {
    console.log(`[slack:skipped] ${text}`);
    return;
  }
  const response = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    console.warn(`Slack webhook failed: ${response.status}`);
  }
}
