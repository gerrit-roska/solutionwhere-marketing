import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { envSlice, projectRoot } from "../config";

// Env slices per job, per the scaffold convention (never read process.env in
// app code). Vendor APIs run through Graphed Tools — no vendor keys here.

export const alertsEnv = () =>
  envSlice(
    z.object({
      // Optional: without it, alerts log to stdout instead of Slack.
      SLACK_WEBHOOK_URL: z.string().url().optional(),
    }),
  );

export const storageEnv = () =>
  envSlice(
    z.object({
      GRAPHED_STORAGE_ENDPOINT: z
        .string({ required_error: "GRAPHED_STORAGE_ENDPOINT missing — run in cloud or under `graphed dev run --`" })
        .url(),
      GRAPHED_STORAGE_BUCKET: z.string().min(1),
      GRAPHED_STORAGE_ACCESS_KEY_ID: z.string().min(1),
      GRAPHED_STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
    }),
  );

// Warehouse schema names per connected source, kept in client config so every
// query references them from one place. Empty string = source not connected
// yet; callers must treat that as "skip, report not-connected".
const warehouseConfigSchema = z.object({
  ga4: z.string().default(""),
  searchConsole: z.string().default(""),
  googleAds: z.string().default(""),
  metaAds: z.string().default(""),
  crm: z.string().default(""),
  instantly: z.string().default(""),
  demoEventName: z.string().default("demo_request"),
  notes: z.record(z.string()).optional(),
});

export type WarehouseConfig = z.infer<typeof warehouseConfigSchema>;

let cachedWarehouseConfig: WarehouseConfig | null = null;

export function warehouseConfig(): WarehouseConfig {
  if (!cachedWarehouseConfig) {
    const path = resolve(projectRoot(), "clients/solutionwhere/warehouse.json");
    cachedWarehouseConfig = warehouseConfigSchema.parse(
      JSON.parse(readFileSync(path, "utf-8")),
    );
  }
  return cachedWarehouseConfig;
}
