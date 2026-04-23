import * as XLSX from "xlsx";
import { z } from "zod";

export interface ImportColumn {
  /** Header in the user's spreadsheet (without the asterisk). */
  key: string;
  /** Whether the column is required. */
  required?: boolean;
  /** Example value rendered in the template. */
  example?: string | number;
  /** Optional human description for tooltips/help text. */
  description?: string;
}

export interface ImportConfig {
  /** Stable id, used for filenames + audit logs. */
  entity: string;
  /** UI label, e.g. "Leads". */
  label: string;
  /** Supabase table name. */
  table: string;
  /** Column definitions for the template + parser. */
  columns: ImportColumn[];
  /** Zod schema applied row by row. Receives the header→value object. */
  schema: z.ZodTypeAny;
  /**
   * Optional async transform: resolves friendly lookups (codes → uuids),
   * fills defaults. May throw with a human message to mark a row invalid.
   */
  transform?: (row: any, ctx: ImportContext) => Promise<any> | any;
  /** Cache keys to invalidate after a successful import. */
  invalidateKeys?: string[][];
}

export interface ImportContext {
  /** Pre-fetched lookup tables, keyed by config-defined name. */
  lookups: Record<string, Map<string, string>>;
}

export interface ParsedRow {
  /** Original 1-based row number in the source file (excluding header). */
  rowNumber: number;
  /** Raw values keyed by header. */
  raw: Record<string, any>;
  /** Validated + transformed values; null while pending or invalid. */
  data: Record<string, any> | null;
  /** First validation/transform error, if any. */
  error: string | null;
}

const TRUE_VALUES = new Set(["true", "yes", "y", "1"]);
const FALSE_VALUES = new Set(["false", "no", "n", "0"]);

export function coerceCell(value: any): any {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    return trimmed;
  }
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function parseBoolean(value: any): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  const s = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(s)) return true;
  if (FALSE_VALUES.has(s)) return false;
  return null;
}

export function parseNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[, ₹$]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function parseDate(value: any): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  // Excel serial number date
  if (typeof value === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + value * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  // Try DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const [, dd, mm, yyyyRaw] = m;
    const yyyy = yyyyRaw.length === 2 ? `20${yyyyRaw}` : yyyyRaw;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (Number.isFinite(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

/**
 * Parse a CSV or XLSX file into row objects keyed by header name.
 */
export async function parseFile(file: File): Promise<{ headers: string[]; rows: Record<string, any>[] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { headers: [], rows: [] };
  const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "", raw: false });
  const headers = Object.keys(json[0] ?? {});
  const rows = json
    .map((row) => {
      const out: Record<string, any> = {};
      for (const h of headers) {
        out[h.trim()] = coerceCell(row[h]);
      }
      return out;
    })
    .filter((row) => Object.values(row).some((v) => v !== null && v !== ""));
  return { headers: headers.map((h) => h.trim()), rows };
}

/**
 * Validate + transform parsed rows against the config.
 */
export async function validateRows(
  rows: Record<string, any>[],
  config: ImportConfig,
  ctx: ImportContext,
): Promise<ParsedRow[]> {
  const results: ParsedRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const rowNumber = i + 2; // +1 for header, +1 for 1-indexed
    try {
      const parsed = config.schema.parse(raw);
      const transformed = config.transform ? await config.transform(parsed, ctx) : parsed;
      results.push({ rowNumber, raw, data: transformed, error: null });
    } catch (err: any) {
      let message = "Invalid row";
      if (err instanceof z.ZodError) {
        const first = err.issues[0];
        message = first ? `${first.path.join(".") || "row"}: ${first.message}` : "Validation failed";
      } else if (err?.message) {
        message = err.message;
      }
      results.push({ rowNumber, raw, data: null, error: message });
    }
  }
  return results;
}

/**
 * Build a CSV template with one example row.
 */
export function buildTemplateCsv(config: ImportConfig): string {
  const header = config.columns.map((c) => (c.required ? `${c.key}*` : c.key)).join(",");
  const example = config.columns
    .map((c) => {
      const v = c.example ?? "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");
  return `${header}\n${example}\n`;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function buildErrorsCsv(rows: ParsedRow[]): string {
  const headers = ["row", "error", ...Object.keys(rows[0]?.raw ?? {})];
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows
    .map((r) => [r.rowNumber, r.error ?? "", ...Object.keys(r.raw).map((k) => r.raw[k])].map(escape).join(","))
    .join("\n");
  return `${headers.join(",")}\n${body}`;
}
