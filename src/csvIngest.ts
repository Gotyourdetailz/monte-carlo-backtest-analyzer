/**
 * CSV ingest and financial-string parsing.
 *
 * Pure TypeScript module — must NOT import React. Single source of truth for
 * CSV parsing, financial-number coercion, and the row-shape `DailyData[]`
 * construction that the simulation engine consumes. Replaces the inline
 * `parseFinancialNumber`, `Papa.parse(...)` invocation, and per-row
 * `parsedData: DailyData[]` map currently inlined in `App.tsx`.
 *
 * Validates: Requirements 10.1, 11.1, 11.2, 25.2.
 */

import Papa from 'papaparse';
import type { DailyData, DataFormat } from './types';

/**
 * CSV header names that must NEVER be exposed as object keys, regardless of
 * what the user-supplied CSV contains. Filtering at ingest time blocks the
 * F-SEC-05 prototype-pollution-adjacent surface and incidentally prevents a
 * malicious CSV from smuggling a magic regime label via a `__segment` column.
 *
 * (`__segment` itself was removed from the row-mutation path in favour of a
 * sidecar `Map<number, RegimeSegmentId>` — see Requirement 11.3 — but the
 * three names below are the prototype-chain-relevant ones we strip
 * unconditionally.)
 */
export const FORBIDDEN_HEADER_SET: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

export interface CsvIngestResult {
  /** Parsed row objects with forbidden own-keys stripped. */
  rows: Record<string, unknown>[];
  /** Header field names with FORBIDDEN_HEADER_SET removed. */
  fields: string[];
  /** Non-fatal parse warnings (e.g. dropped header names, Papaparse error rows). */
  warnings: string[];
}

export interface ParseCsvFileOptions {
  /** Optional progress callback in `[0, 1]`. Currently a stub: Papaparse worker
   *  mode does not emit deterministic progress events; the hook layer
   *  surfaces a coarse `parsing` / `done` indicator instead. */
  onProgress?: (p: number) => void;
}

export interface ParseDailyDataInput {
  rows: Record<string, unknown>[];
  /** PnL column name. Required. */
  pnlCol: string;
  /** Regime tag column. When set and not equal to `'None'`, populates `DailyData.regime`. */
  regimeCol?: string;
  /** Timestamp column. When set and not equal to `'None'`, populates `DailyData.timestamp`. */
  timestampCol?: string;
  /** Benchmark return column. When set and not equal to `'None'`, populates `DailyData.benchmarkReturn`. */
  benchmarkCol?: string;
  /** Factor column names (already split / trimmed). Empty / undefined -> no factor row. */
  factorCols?: string[];
  /** `'pct'` divides benchmark + factor values by 100; otherwise pass-through. */
  benchmarkFormat?: DataFormat;
  /**
   * Sidecar regime-segment assignments by original row index (Requirement 11.3).
   * When provided, the corresponding row's `segment` field is populated. The
   * row object is NEVER mutated to carry a `__segment` property.
   */
  segments?: Map<number, string>;
}

export interface ParseDailyDataError {
  /** Index into `input.rows` (0-based, original ordering). */
  row: number;
  column: string;
  reason: string;
}

export interface ParseDailyDataResult {
  data: DailyData[];
  errors: ParseDailyDataError[];
}

/**
 * Coerce a financial-string-like value to a number.
 *
 * Accepts:
 * - `number` -> returned as-is (including `NaN` / `Infinity`).
 * - `string` -> strips `$`, `,`, and whitespace; treats parenthesised values
 *   as negative (e.g. `"(1,234.56)"` -> `-1234.56`); falls back to `Number(...)`.
 * - any other type -> `NaN`.
 *
 * Returns `NaN` on malformed input. Never throws.
 *
 * Validates: Requirements 10.1, 11.1, 25.2 (Properties 3, 4).
 */
export function parseFinancialNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  let clean = value.replace(/[$,\s]/g, '');
  if (clean.startsWith('(') && clean.endsWith(')')) {
    clean = '-' + clean.slice(1, -1);
  }
  // `Number('')` is 0 in the spec; keep that quirk to preserve the existing
  // App.tsx ingest semantics (empty/whitespace cells are filtered upstream by
  // the `row[pnlCol] === ''` guard before this function is invoked).
  return Number(clean);
}

/**
 * Strip forbidden header names from the field list and from each row object's
 * own keys. Returns the cleaned `{ rows, fields }` pair plus any warnings
 * (one per dropped header name).
 *
 * Exported so the deterministic header-filtering pass can be exercised
 * directly by property tests (see `src/__tests__/property_csv_header_filter.test.ts`)
 * without having to drive PapaParse end-to-end. The behaviour and contract
 * remain identical to the in-`parseCsvFile` invocation.
 */
export function sanitizeFields(
  rawFields: string[] | undefined,
  rawRows: unknown[]
): { rows: Record<string, unknown>[]; fields: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const fields: string[] = [];
  for (const f of rawFields ?? []) {
    if (FORBIDDEN_HEADER_SET.has(f)) {
      warnings.push(
        `Dropped forbidden header "${f}" — reserved JavaScript prototype key.`
      );
      continue;
    }
    fields.push(f);
  }

  const rows: Record<string, unknown>[] = [];
  for (const r of rawRows) {
    if (r === null || typeof r !== 'object') continue;
    const src = r as Record<string, unknown>;
    // Defensive copy: even if Papaparse used `Object.create(null)`, we still
    // strip forbidden own-keys here so callers can rely on the property never
    // appearing downstream.
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src)) {
      if (FORBIDDEN_HEADER_SET.has(k)) continue;
      out[k] = src[k];
    }
    rows.push(out);
  }
  return { rows, fields, warnings };
}

/**
 * Parse a `File` / `Blob` via Papaparse.
 *
 * **Off-main-thread parsing (Requirement 12.1, task 5.16):** Papaparse is
 * invoked with `worker: true`, which spawns a dedicated Papaparse Web Worker
 * and streams parse / tokenization off the main thread. This keeps the React
 * UI responsive while a multi-thousand-row NinjaTrader / backtest CSV is
 * tokenized; structured-cloned `results.data` returns to the main thread when
 * complete. Headers in `FORBIDDEN_HEADER_SET` are stripped from both the
 * field list and from row own-keys before resolving.
 *
 * Numeric coercion is left to the caller via `parseFinancialNumber`
 * (`dynamicTyping: false`) so financial formats like `"$1,234"` and `"(50)"`
 * are not silently turned into `NaN` by Papaparse's loose number parser.
 */
export function parseCsvFile(
  file: File | Blob,
  opts?: ParseCsvFileOptions
): Promise<CsvIngestResult> {
  // `opts.onProgress` is reserved for future use; Papaparse's worker mode does
  // not surface byte-level progress events. The `useCsvIngest` hook layer
  // owns the user-visible spinner / progress text.
  void opts;

  return new Promise((resolve, reject) => {
    Papa.parse(file as File, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
      worker: true,
      complete: (results) => {
        const sanitized = sanitizeFields(
          results.meta.fields,
          results.data as unknown[]
        );
        const warnings = sanitized.warnings.slice();
        // Surface non-fatal Papaparse errors as warnings (we don't reject on
        // them — they typically describe per-row recoverable issues like
        // ragged rows that PapaParse already left out of `data`).
        for (const e of results.errors ?? []) {
          warnings.push(
            `Papaparse: ${e.type ?? 'error'} on row ${e.row ?? '?'}: ${e.message}`
          );
        }
        resolve({
          rows: sanitized.rows,
          fields: sanitized.fields,
          warnings,
        });
      },
      error: (err) => {
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    });
  });
}

/**
 * Build `DailyData[]` from already-parsed rows. Returns a typed `errors[]`
 * list rather than swallowing failures — callers (the preview-stats memo,
 * the worker dispatch path) surface the first error in the UI banner instead
 * of silently dropping rows.
 *
 * Filtering / coercion semantics match the legacy App.tsx implementation:
 * - Rows with a missing / empty / non-numeric PnL cell are SKIPPED (recorded
 *   in `errors` with the corresponding reason).
 * - Benchmark and factor cells that fail `parseFinancialNumber` produce
 *   `undefined` for that row (no row drop, no error entry — same as the
 *   pre-decomposition behaviour).
 * - When `benchmarkFormat === 'pct'`, benchmark and factor numbers are
 *   divided by 100 to convert percent to decimal.
 *
 * Validates: Requirements 10.1, 11.3, 25.2.
 */
export function buildDailyData(input: ParseDailyDataInput): ParseDailyDataResult {
  const {
    rows,
    pnlCol,
    regimeCol,
    timestampCol,
    benchmarkCol,
    factorCols,
    benchmarkFormat,
    segments,
  } = input;

  const data: DailyData[] = [];
  const errors: ParseDailyDataError[] = [];

  const factorNames = (factorCols ?? []).filter((s) => s.length > 0);
  const useRegime = !!regimeCol && regimeCol !== 'None';
  const useTimestamp = !!timestampCol && timestampCol !== 'None';
  const useBenchmark = !!benchmarkCol && benchmarkCol !== 'None';
  const pctScale = benchmarkFormat === 'pct';

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rawPnl = row[pnlCol];
    if (rawPnl === null || rawPnl === undefined || rawPnl === '') {
      errors.push({ row: i, column: pnlCol, reason: 'PnL cell is empty.' });
      continue;
    }
    const pnl = parseFinancialNumber(rawPnl);
    if (!isFinite(pnl) || isNaN(pnl)) {
      errors.push({
        row: i,
        column: pnlCol,
        reason: `PnL value "${String(rawPnl)}" is not a finite number.`,
      });
      continue;
    }

    let benchmarkReturn: number | undefined;
    if (useBenchmark) {
      const benchRaw = parseFinancialNumber(row[benchmarkCol as string]);
      if (isFinite(benchRaw)) {
        benchmarkReturn = pctScale ? benchRaw / 100 : benchRaw;
      }
    }

    let factorRow: number[] | undefined;
    if (factorNames.length > 0) {
      const vals = factorNames.map((n) => parseFinancialNumber(row[n]));
      if (vals.every((v) => isFinite(v))) {
        factorRow = pctScale ? vals.map((v) => v / 100) : vals;
      }
    }

    const segment = segments?.get(i);

    const item: DailyData = {
      pnl,
      regime: useRegime ? String(row[regimeCol as string]) : undefined,
      segment,
      timestamp:
        useTimestamp && row[timestampCol as string] != null
          ? String(row[timestampCol as string])
          : undefined,
      benchmarkReturn,
      factorRow,
    };
    data.push(item);
  }

  return { data, errors };
}

/**
 * Portfolio-sleeve assembly helper for the multi-strategy dispatch path.
 *
 * Walks the parsed CSV rows by original index so the segment id can be
 * looked up in the sidecar `regimeSegments` map (Requirement 11.3) rather
 * than mutating row objects with a `__segment` property. Returns a
 * `DailyData[]` per sleeve definition, with PnL coerced via
 * `parseFinancialNumber`.
 *
 * Two sleeve modes are supported:
 *   1. Column-aligned: each row's `column` cell is the sleeve PnL. Rows
 *      with empty / non-numeric values are skipped.
 *   2. NinjaTrader instrument-grouped (`groupByInstrument: true`): rows are
 *      filtered by `instrumentCol === sleeve.column`; the PnL is read from
 *      `profitCol` on each matching row.
 *
 * Throws when a sleeve has no valid trades, so the caller surfaces a
 * precise error message (`"No valid trades in column '<X>'."`) into the UI
 * banner instead of silently dispatching an empty horizon.
 */
export interface PortfolioSleeveSpec {
  column: string;
  name: string;
  weight: number;
  groupByInstrument?: boolean;
}

export function buildPortfolioStrategySleeves(opts: {
  rows: Record<string, unknown>[];
  sleeves: PortfolioSleeveSpec[];
  instrumentCol: string;
  profitCol: string;
  segments?: Map<number, string> | null;
}): { id: string; name: string; weight: number; data: DailyData[] }[] {
  const { rows, sleeves, instrumentCol, profitCol, segments } = opts;
  return sleeves.map((st) => {
    const data: DailyData[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (st.groupByInstrument) {
        if (String(row[instrumentCol] ?? '').trim() !== st.column) continue;
      } else {
        const v = row[st.column];
        if (v === null || v === undefined || v === '') continue;
        if (isNaN(parseFinancialNumber(v))) continue;
      }
      const pnl = parseFinancialNumber(
        st.groupByInstrument ? row[profitCol] : row[st.column],
      );
      if (isNaN(pnl)) continue;
      const seg = segments?.get(i);
      data.push({ pnl, segment: seg != null ? String(seg) : undefined });
    }
    if (!data.length) {
      throw new Error(`No valid trades in column "${st.column}".`);
    }
    return { id: st.column, name: st.name, weight: st.weight, data };
  });
}

/**
 * Heuristic: detect which CSV columns are likely numeric per-strategy PnL
 * sleeves. Skips known NinjaTrader metadata columns (passed in by the caller
 * via `nonSleeveColumns`) and requires ≥ 70% of the first 50 rows to be
 * numeric under `parseFinancialNumber`.
 */
export function detectNumericColumns(
  data: Record<string, unknown>[],
  fields: string[],
  nonSleeveColumns: ReadonlySet<string>,
): string[] {
  return fields.filter((col) => {
    if (nonSleeveColumns.has(col.trim().toLowerCase())) return false;
    const sample = data.slice(0, Math.min(50, data.length));
    if (!sample.length) return false;
    const numericCount = sample.filter(
      (row) => !isNaN(parseFinancialNumber(row[col])),
    ).length;
    return numericCount >= sample.length * 0.7;
  });
}
