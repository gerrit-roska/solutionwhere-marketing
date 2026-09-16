import { graphed } from "./graphed";
import { warehouseConfig } from "./config";

export { warehouseConfig };

const SCHEMA_NAME = /^[a-zA-Z0-9_]+$/;

/**
 * Warehouse query with the configured schema names available for
 * interpolation. Parameters use `%(name)s` placeholders and arrive
 * server-side as strings; schema names are validated and interpolated in
 * code (same approach as the seo kit's warehouse helper).
 */
export async function wq<
  T extends Record<string, unknown> = Record<string, unknown>,
>(sql: string, params: Record<string, string> = {}): Promise<T[]> {
  const { results } = await graphed.warehouse.query<T>(sql, params);
  return results;
}

/** Interpolates `{ga4}`-style schema placeholders after validating names. */
export function withSchemas(sql: string): string {
  const config = warehouseConfig() as unknown as Record<string, string>;
  return sql.replace(/\{(\w+)\}/g, (_, key: string) => {
    const schema = config[key];
    if (!schema) throw new Error(`Warehouse source not connected: ${key}`);
    if (!SCHEMA_NAME.test(schema)) {
      throw new Error(`Invalid schema name for ${key}: ${schema}`);
    }
    return schema;
  });
}

export interface MetaAdsAccount {
  schema: string;
  id: string | null;
  name: string | null;
  currency: string | null;
  timezoneName: string | null;
}

/** Live identity of the configured Meta Ads warehouse source, if any. */
export async function loadMetaAdsAccount(): Promise<MetaAdsAccount | null> {
  const schema = warehouseConfig().metaAds;
  if (!schema) return null;
  if (!graphed.isConfigured()) {
    return {
      schema,
      id: null,
      name: null,
      currency: null,
      timezoneName: null,
    };
  }
  try {
    const rows = await wq<{
      id: number | string;
      name: string | null;
      currency: string | null;
      timezone_name: string | null;
    }>(
      withSchemas(
        `SELECT id, name, currency, timezone_name FROM {metaAds}.account_history LIMIT 1`,
      ),
    );
    const row = rows[0];
    return {
      schema,
      id: row?.id != null ? String(row.id) : null,
      name: row?.name ?? null,
      currency: row?.currency ?? null,
      timezoneName: row?.timezone_name ?? null,
    };
  } catch {
    return {
      schema,
      id: null,
      name: null,
      currency: null,
      timezoneName: null,
    };
  }
}
