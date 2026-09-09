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
