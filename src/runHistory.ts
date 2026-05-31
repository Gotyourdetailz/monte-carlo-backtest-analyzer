/**
 * runHistory.ts
 *
 * Audit-friendly local persistence of every simulation run, keyed by
 * runId.  Implements the institutional baseline of "I can prove which
 * inputs produced which numbers, six months from now" without requiring
 * a server.  Storage is browser IndexedDB; nothing leaves the machine.
 *
 * Schema (one object store, key path 'runId'):
 *   - runId        unique
 *   - timestamp    ISO 8601
 *   - modelType    'basic' | 'regime' | 'parametric' | 'portfolio' | 'garch'
 *   - randomSeed   number | null
 *   - samplingMode 'bootstrap' | 'permutation' | 'block_bootstrap'
 *   - dataFormat   'absolute' | 'pct' | 'mult'
 *   - rowFrequency 'trade' | 'day'
 *   - nSimulations number
 *   - nTrades      number
 *   - startingCapital number
 *   - dataDigest   sha-256 hex of the input PnL series
 *   - summary      compact metric snapshot for filtered list views
 *   - validationVerdict 'pass' | 'warn' | 'fail' | undefined
 *   - rawResults   the full SimulationResults object (excluding bulky path arrays)
 *
 * All API calls are async and degrade gracefully if IndexedDB is
 * unavailable (private browsing on some Safari versions).
 */

import type { SimulationResults } from './types';

const DB_NAME = 'mc-risk-desk';
const STORE = 'runs';
const DB_VERSION = 1;

/**
 * Retention cap for persisted run-history entries (Requirement 15.1).
 * `recordRun` evicts oldest-by-timestamp entries when the count would
 * exceed this cap. Defined as a single named constant so it can be
 * referenced (and adjusted) in one place.
 */
export const MAX_STORED_RUNS = 50;

/**
 * Default bin count for the equi-width histograms persisted in lieu of
 * the raw `finalBalances` / `maxDrawdowns` arrays (Requirement 15.4).
 */
const HISTOGRAM_BIN_COUNT = 200;

export type RunHistoryEntry = {
  runId: string;
  timestamp: string;
  modelType: string;
  randomSeed: number | null;
  samplingMode: string;
  dataFormat: string;
  rowFrequency: string;
  nSimulations: number;
  nTrades: number;
  startingCapital: number;
  dataDigest: string;
  summary: {
    medianFinalBalance: number;
    medianMaxDrawdown: number;
    var95: number;
    cvar95: number;
    ruinProbability: number;
    terminalPnLValid: boolean;
  };
  validationVerdict?: 'pass' | 'warn' | 'fail';
  /**
   * Compressed payload — drops `paths`, `finalBalances`, and `maxDrawdowns`
   * to keep a single entry within reasonable IndexedDB size bounds
   * (Requirement 15.4). The full distributions are summarized in the
   * `*Histogram` / `*Summary` fields below; reproducibility checks rely
   * on `institutionalMetrics` / `runMeta`, which are still present in
   * full on `rawResults`.
   */
  rawResults: Omit<SimulationResults, 'paths' | 'finalBalances' | 'maxDrawdowns'>;
  /**
   * Persisted summary of the final-balance distribution (Requirement 15.4).
   * Replaces persisting the raw `finalBalances[]` array on the entry.
   * Optional on read for backward compatibility; populated by task 8.10.
   */
  finalBalanceHistogram?: HistogramSummary;
  /** Summary statistics over the final-balance distribution (Requirement 15.4). */
  finalBalanceSummary?: DistributionSummary;
  /**
   * Persisted summary of the max-drawdown distribution (Requirement 15.4).
   * Optional on read for backward compatibility; populated by task 8.10.
   */
  maxDrawdownHistogram?: HistogramSummary;
  /** Summary statistics over the max-drawdown distribution (Requirement 15.4). */
  maxDrawdownSummary?: DistributionSummary;
};

/**
 * Equi-width histogram persisted in lieu of the raw distribution array
 * (Requirement 15.4). 200 bins is the design default; `binSize = (binEnd -
 * binStart) / counts.length` and bin _i_ covers
 * `[binStart + i * binSize, binStart + (i + 1) * binSize)`.
 */
export type HistogramSummary = {
  binStart: number;
  binEnd: number;
  binSize: number;
  counts: number[];
};

/**
 * Compact summary statistics persisted alongside a `HistogramSummary` so
 * downstream comparisons can recover percentile-style metrics without
 * touching the raw arrays.
 */
export type DistributionSummary = {
  min: number;
  p5: number;
  median: number;
  mean: number;
  p95: number;
  max: number;
  std: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'runId' });
          store.createIndex('byTimestamp', 'timestamp');
          store.createIndex('byModel', 'modelType');
          store.createIndex('byDigest', 'dataDigest');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

/**
 * SHA-256 hex digest of a numeric series, used as a fast input-drift alarm
 * over the PnL series (see Requirement 9.5). All bytes are written little-
 * endian via a `DataView` so the digest is identical across host CPUs
 * regardless of native endianness (Requirement 9.8).
 *
 * Byte layout (all LE):
 *   uint32  count
 *   count × float64  values
 */
export async function pnlDigest(series: number[]): Promise<string> {
  return sha256Hex(packFloat64SeriesLE(series));
}

/**
 * Backwards-compatible alias for {@link pnlDigest}. The pre-remediation API
 * shipped this name, and call sites in `App.tsx` still import it. New code
 * SHOULD prefer `pnlDigest` (semantic) or `hashRunInputs` (full input
 * coverage).
 */
export async function hashSeries(series: number[]): Promise<string> {
  return pnlDigest(series);
}

/**
 * Canonical engine-input shape consumed by {@link hashRunInputs}. Every field
 * that influences the simulation outcome must appear here; otherwise the
 * digest will silently miss the change. Optional fields default as
 * documented on each property.
 */
export interface RunInputCanonical {
  /** Raw PnL series in user-supplied row order. */
  pnls: number[];
  /**
   * Stable integer IDs for per-row regime labels. Map regime strings to IDs
   * via a sorted-unique-list scheme upstream so identical regime sets always
   * produce identical IDs. Empty array if the model does not use regimes.
   */
  regimeTagIds: number[];
  /** Optional per-row benchmark series. Treated as length-0 when absent. */
  benchmark?: number[];
  /**
   * Optional factor matrix in row-major form, dims `[nRows][nCols]`. Must be
   * rectangular. Treated as 0×0 when absent.
   */
  factorMatrix?: number[][];
  /** Per-trade commission in account currency. */
  commission: number;
  /** Slippage configuration. `model` is length-prefixed in the canonical layout. */
  slippage: { model: string; impactCoefficient: number };
  /** Optional portfolio sleeve weights. Treated as length-0 when absent. */
  sleeveWeights?: number[];
  /** Prop-firm rule settings. Encode `enabled` upstream by zeroing the
   *  numeric fields if disabled, OR by passing the user-supplied values
   *  verbatim — either is fine, as long as the choice is consistent across
   *  the runs you intend to compare. */
  prop: { target: number; maxDrawdown: number; consistencyPercent: number };
  /** Daily-loss limit settings. */
  dailyLoss: {
    enabled: boolean;
    maxLosses: number;
    maxLossDollars: number;
    tradesPerSession: number;
  };
  // String fields — length-prefixed in the canonical layout:
  /** User-supplied sampling mode (verbatim, before any engine coercion). */
  samplingMode: string;
  /** Model branch ('basic', 'regime', 'parametric', 'portfolio', 'garch'). */
  modelType: string;
  /** PnL data format ('absolute', 'pct', 'mult'). */
  dataFormat: string;
  /** Row-frequency tag ('trade', 'day'). */
  rowFrequency: string;
}

/**
 * 4-byte ASCII magic prefix ("MCRI" — Monte Carlo Run Inputs) so a future
 * change to the canonical layout can bump {@link HASH_VERSION} without
 * colliding with prior digests.
 */
const HASH_MAGIC = new Uint8Array([0x4d, 0x43, 0x52, 0x49]);

/**
 * Canonical-layout version. Bump when the byte layout below changes.
 * Persisted digests stay stable across reads as long as the writer uses the
 * same version.
 */
const HASH_VERSION = 1;

/**
 * SHA-256 hex digest over the full canonical engine-input space
 * (Requirement 9.5). Replaces the PnL-only `hashSeries` for the
 * `dataDigest` field on `RunHistoryEntry`; `pnlDigest` is retained
 * separately as a fast drift alarm.
 *
 * All multi-byte numbers are written **little-endian** via a `DataView`,
 * regardless of the host CPU's native endianness, so the digest is
 * portable across browsers and architectures (Requirement 9.8).
 *
 * Canonical byte layout (all little-endian):
 *
 *   bytes 0..3    : magic 'MCRI'  (0x4D 0x43 0x52 0x49)
 *   bytes 4..7    : uint32 hashVersion
 *
 *   For each of the four numeric vectors, in order — pnls, regimeTagIds,
 *   benchmark (or empty), sleeveWeights (or empty):
 *     uint32  count
 *     count × float64  values
 *
 *   Factor matrix (or 0×0 when absent):
 *     uint32  nRows
 *     uint32  nCols
 *     nRows*nCols × float64  values  (row-major)
 *
 *   Fixed scalar block (9 × float64), in this exact order:
 *     commission
 *     slippage.impactCoefficient
 *     prop.target
 *     prop.maxDrawdown
 *     prop.consistencyPercent
 *     dailyLoss.enabled (encoded as 1.0 / 0.0)
 *     dailyLoss.maxLosses
 *     dailyLoss.maxLossDollars
 *     dailyLoss.tradesPerSession
 *
 *   For each string field, in order — slippage.model, samplingMode,
 *   modelType, dataFormat, rowFrequency:
 *     uint32  charCount  (UTF-16 code-unit count, i.e. `string.length`)
 *     charCount × uint16  code units
 *
 * @throws Error when `factorMatrix` is non-rectangular (would otherwise
 *   produce a layout-dependent digest).
 */
export async function hashRunInputs(input: RunInputCanonical): Promise<string> {
  // --- 1. Validate the factor matrix shape up front so layout math is sound.
  const factorRows = input.factorMatrix?.length ?? 0;
  const factorCols =
    factorRows > 0 ? input.factorMatrix![0]?.length ?? 0 : 0;
  if (input.factorMatrix && factorRows > 0) {
    for (let r = 0; r < factorRows; r++) {
      if (input.factorMatrix[r].length !== factorCols) {
        throw new Error(
          `hashRunInputs: factorMatrix is not rectangular (row ${r} has ${input.factorMatrix[r].length} cols, expected ${factorCols})`
        );
      }
    }
  }

  const numericBlocks: readonly number[][] = [
    input.pnls,
    input.regimeTagIds,
    input.benchmark ?? [],
    input.sleeveWeights ?? [],
  ];
  const stringFields: readonly string[] = [
    input.slippage.model,
    input.samplingMode,
    input.modelType,
    input.dataFormat,
    input.rowFrequency,
  ];

  // --- 2. Compute total byte length so we can allocate a single contiguous
  //         buffer and write into it without intermediate concatenation.
  let total = HASH_MAGIC.length + 4; // magic + version
  for (const block of numericBlocks) {
    total += 4 + block.length * 8;
  }
  total += 4 + 4 + factorRows * factorCols * 8; // matrix dims + values
  total += 9 * 8; // fixed scalar block
  for (const s of stringFields) {
    total += 4 + s.length * 2;
  }

  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let off = 0;

  // --- 3. Magic + version.
  u8.set(HASH_MAGIC, off);
  off += HASH_MAGIC.length;
  view.setUint32(off, HASH_VERSION, /* littleEndian */ true);
  off += 4;

  // --- 4. Numeric vectors (length-prefixed, float64 LE values).
  for (const block of numericBlocks) {
    view.setUint32(off, block.length, true);
    off += 4;
    for (let i = 0; i < block.length; i++) {
      view.setFloat64(off, block[i], true);
      off += 8;
    }
  }

  // --- 5. Factor matrix: dims + row-major float64 LE values.
  view.setUint32(off, factorRows, true);
  off += 4;
  view.setUint32(off, factorCols, true);
  off += 4;
  if (input.factorMatrix && factorRows > 0 && factorCols > 0) {
    for (let r = 0; r < factorRows; r++) {
      const row = input.factorMatrix[r];
      for (let c = 0; c < factorCols; c++) {
        view.setFloat64(off, row[c], true);
        off += 8;
      }
    }
  }

  // --- 6. Fixed scalar block (9 × float64 LE) — order matters.
  const scalars = [
    input.commission,
    input.slippage.impactCoefficient,
    input.prop.target,
    input.prop.maxDrawdown,
    input.prop.consistencyPercent,
    input.dailyLoss.enabled ? 1 : 0,
    input.dailyLoss.maxLosses,
    input.dailyLoss.maxLossDollars,
    input.dailyLoss.tradesPerSession,
  ];
  for (let i = 0; i < scalars.length; i++) {
    view.setFloat64(off, scalars[i], true);
    off += 8;
  }

  // --- 7. Strings: uint32 char count, then `length` × uint16 LE code units.
  for (const s of stringFields) {
    view.setUint32(off, s.length, true);
    off += 4;
    for (let i = 0; i < s.length; i++) {
      view.setUint16(off, s.charCodeAt(i), true);
      off += 2;
    }
  }

  // Defensive: if the layout math is wrong we want to find out immediately
  // rather than silently produce a digest over uninitialized tail bytes.
  if (off !== total) {
    throw new Error(
      `hashRunInputs: byte layout mismatch (wrote ${off}, expected ${total})`
    );
  }

  return sha256Hex(u8);
}

/**
 * Pack a numeric series into a freshly-allocated `Uint8Array` using
 * explicit-LE float64 writes via a `DataView`. Used by both
 * {@link pnlDigest} and {@link hashRunInputs} so neither implementation
 * relies on the host CPU's native endianness.
 *
 * Byte layout (all LE):
 *   uint32  count
 *   count × float64  values
 */
function packFloat64SeriesLE(series: number[]): Uint8Array {
  const total = 4 + series.length * 8;
  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  view.setUint32(0, series.length, /* littleEndian */ true);
  let off = 4;
  for (let i = 0; i < series.length; i++) {
    view.setFloat64(off, series[i], true);
    off += 8;
  }
  return new Uint8Array(buf);
}

/**
 * SHA-256 over the given bytes, returned as a lowercase hex string. Falls
 * back to a non-cryptographic but stable hash on environments without
 * `crypto.subtle` (e.g. some Safari private-browsing modes); the fallback
 * value is prefixed with `nonsec-` so callers can detect it.
 */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    // Best-effort fallback: a non-cryptographic but stable hash.
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < bytes.length; i++) {
      h1 = Math.imul(h1 ^ bytes[i], 2654435761) >>> 0;
      h2 = Math.imul(h2 ^ bytes[i], 1597334677) >>> 0;
    }
    return `nonsec-${h1.toString(16).padStart(8, '0')}${h2
      .toString(16)
      .padStart(8, '0')}-n${bytes.length}`;
  }
  // `bytes.buffer` may be a SharedArrayBuffer-backed view in some hosts;
  // copy into a fresh ArrayBuffer slice to keep the input Transferable-free.
  const slice = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  );
  const digest = await crypto.subtle.digest('SHA-256', slice);
  const out = new Uint8Array(digest);
  return Array.from(out)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function buildEntry(
  results: SimulationResults,
  inputDigest: string
): RunHistoryEntry {
  const verdict = results.modelValidation?.overallVerdict;
  const {
    paths: _paths,
    finalBalances,
    maxDrawdowns,
    ...rest
  } = results;
  const finalBalanceHistogram = buildHistogram(finalBalances, HISTOGRAM_BIN_COUNT);
  const finalBalanceSummary = buildSummary(finalBalances);
  const maxDrawdownHistogram = buildHistogram(maxDrawdowns, HISTOGRAM_BIN_COUNT);
  const maxDrawdownSummary = buildSummary(maxDrawdowns);
  return {
    runId: results.runMeta.runId,
    timestamp: results.runMeta.timestamp,
    modelType: results.runMeta.modelType,
    randomSeed: results.runMeta.randomSeed,
    samplingMode: results.runMeta.samplingMode,
    dataFormat: results.runMeta.dataFormat,
    rowFrequency: results.runMeta.rowFrequency,
    nSimulations: results.runMeta.nSimulations,
    nTrades: results.runMeta.nTrades,
    startingCapital: rest.originalPath[0] ?? 0,
    dataDigest: inputDigest,
    summary: {
      medianFinalBalance: results.institutionalMetrics.medianFinalBalance,
      medianMaxDrawdown: results.institutionalMetrics.medianMaxDrawdown,
      var95: results.institutionalMetrics.var95,
      cvar95: results.institutionalMetrics.cvar95,
      ruinProbability: results.ruinProbability,
      terminalPnLValid: results.metricsValidity.terminalPnL,
    },
    validationVerdict: verdict,
    rawResults: rest as Omit<
      SimulationResults,
      'paths' | 'finalBalances' | 'maxDrawdowns'
    >,
    finalBalanceHistogram,
    finalBalanceSummary,
    maxDrawdownHistogram,
    maxDrawdownSummary,
  };
}

/**
 * Build a `HISTOGRAM_BIN_COUNT`-bin equi-width histogram over `data`
 * (Requirement 15.4). Used to persist a compact representation of
 * `finalBalances` / `maxDrawdowns` in lieu of the raw arrays. Bin _i_
 * covers `[binStart + i * binSize, binStart + (i + 1) * binSize)`; the
 * final bin is right-inclusive so the maximum value is always counted.
 *
 * Non-finite values (`NaN`, `±Infinity`) are dropped before binning so
 * the resulting `binStart` / `binEnd` are always finite.
 */
export function buildHistogram(
  data: number[],
  nBins: number = HISTOGRAM_BIN_COUNT
): HistogramSummary {
  const safeBins = Math.max(1, Math.floor(nBins));
  const finite = data.filter((v) => Number.isFinite(v));
  if (finite.length === 0) {
    return {
      binStart: 0,
      binEnd: 0,
      binSize: 0,
      counts: new Array(safeBins).fill(0),
    };
  }
  let min = finite[0];
  let max = finite[0];
  for (let i = 1; i < finite.length; i++) {
    const v = finite[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  // Degenerate range (all values identical): emit a single populated bin
  // and pad the rest with zeros so downstream code can rely on `counts`
  // having `safeBins` entries.
  if (min === max) {
    const counts = new Array(safeBins).fill(0);
    counts[0] = finite.length;
    return { binStart: min, binEnd: max, binSize: 0, counts };
  }
  const binSize = (max - min) / safeBins;
  const counts = new Array(safeBins).fill(0);
  for (let i = 0; i < finite.length; i++) {
    const v = finite[i];
    let idx = Math.floor((v - min) / binSize);
    // Right-inclusive final bin so the max value lands in counts[nBins-1].
    if (idx >= safeBins) idx = safeBins - 1;
    if (idx < 0) idx = 0;
    counts[idx]++;
  }
  return { binStart: min, binEnd: max, binSize, counts };
}

/**
 * Compute the compact summary statistics persisted alongside a
 * `HistogramSummary` (Requirement 15.4). Percentiles use a simple
 * floor-index rule consistent with `riskMetrics.percentile` so audit-log
 * comparisons stay aligned with the live VaR/CVaR pipeline.
 */
export function buildSummary(data: number[]): DistributionSummary {
  const finite = data.filter((v) => Number.isFinite(v));
  const n = finite.length;
  if (n === 0) {
    return { min: 0, p5: 0, median: 0, mean: 0, p95: 0, max: 0, std: 0 };
  }
  const sortedAsc = [...finite].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[n - 1];
  const pickPercentile = (p: number): number => {
    const idx = Math.min(n - 1, Math.max(0, Math.floor(n * p)));
    return sortedAsc[idx];
  };
  let sum = 0;
  for (let i = 0; i < n; i++) sum += finite[i];
  const mean = sum / n;
  let sqSum = 0;
  for (let i = 0; i < n; i++) {
    const d = finite[i] - mean;
    sqSum += d * d;
  }
  const std = Math.sqrt(sqSum / n);
  return {
    min,
    p5: pickPercentile(0.05),
    median: pickPercentile(0.5),
    mean,
    p95: pickPercentile(0.95),
    max,
    std,
  };
}

export async function recordRun(
  results: SimulationResults,
  inputDigest: string
): Promise<void> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.put(buildEntry(results, inputDigest));
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve(); // best-effort
  });
  // Enforce the retention cap (Requirement 15.1). Done in a separate
  // transaction so a failed eviction can't roll back the just-written
  // entry; eviction is a soft maintenance step.
  await enforceRetentionCap(db);
}

/**
 * Trim the run-history store to {@link MAX_STORED_RUNS} entries by
 * deleting the oldest-by-timestamp entries first (Requirement 15.1).
 * Eviction is logged at `info` level — eviction is normal operation,
 * not a warning.
 */
async function enforceRetentionCap(db: IDBDatabase): Promise<void> {
  const oldest = await new Promise<RunHistoryEntry[]>((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const idx = tx.objectStore(STORE).index('byTimestamp');
    const out: RunHistoryEntry[] = [];
    const req = idx.openCursor(null, 'next');
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) {
        out.push(cur.value as RunHistoryEntry);
        cur.continue();
      } else {
        resolve(out);
      }
    };
    req.onerror = () => resolve([]);
  });
  if (oldest.length <= MAX_STORED_RUNS) return;
  const toEvict = oldest.slice(0, oldest.length - MAX_STORED_RUNS);
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const entry of toEvict) {
      store.delete(entry.runId);
      console.info(
        `[runHistory] retention cap (${MAX_STORED_RUNS}) reached; evicted run ${entry.runId} (timestamp ${entry.timestamp})`
      );
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function listRuns(limit = 50): Promise<RunHistoryEntry[]> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return [];
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const idx = tx.objectStore(STORE).index('byTimestamp');
    const out: RunHistoryEntry[] = [];
    const req = idx.openCursor(null, 'prev');
    req.onsuccess = () => {
      const cur = req.result;
      if (cur && out.length < limit) {
        out.push(cur.value as RunHistoryEntry);
        cur.continue();
      } else {
        resolve(out);
      }
    };
    req.onerror = () => resolve([]);
  });
}

export async function getRun(runId: string): Promise<RunHistoryEntry | null> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return null;
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(runId);
    req.onsuccess = () => resolve((req.result as RunHistoryEntry) ?? null);
    req.onerror = () => resolve(null);
  });
}

export async function deleteRun(runId: string): Promise<void> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return;
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(runId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function clearAll(): Promise<void> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return;
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/**
 * Tolerance for fixed-seed reproducibility comparisons (Requirement 9.7,
 * task 8.8). Two summary metrics agree when
 * `|a - b| < REPRO_TOLERANCE * max(1, |a|)`. Tightened from `1e-3` to
 * `1e-9` because fixed-seed runs MUST match to within floating-point
 * reordering noise; anything looser hides real drift in the engine.
 */
export const REPRO_TOLERANCE = 1e-9;

/**
 * Reproducibility check.  Two prior runs are "reproducible peers" if they
 * share input digest, seed, samplingMode, modelType, dataFormat,
 * rowFrequency, nSimulations, nTrades, AND `prngFamily` — under those
 * conditions the engine MUST return identical institutional metrics.
 *
 * `prngFamily` is checked separately from the other input fields so that
 * a mismatch produces a visible delta entry (Requirement 9.2, task 8.8)
 * rather than silently collapsing to `deltas: []`. Two runs with the
 * same seed but different PRNG families (e.g. one TS-only path and one
 * Rust-kernel path) are NOT reproducible peers and the comparator MUST
 * say so explicitly.
 *
 * Returns the worst absolute discrepancy across the summary numbers,
 * plus a synthetic `prngFamily` row when the families disagree.
 */
export type ReproDelta = {
  field: keyof RunHistoryEntry['summary'] | 'prngFamily';
  a: number | string;
  b: number | string;
  /**
   * For numeric `summary` fields: `|a - b|`.
   * For the synthetic `prngFamily` row: `Infinity` (the values are
   * categorical, not numeric, so any mismatch is a hard fail).
   */
  absDelta: number;
};

export function compareReproducibility(
  a: RunHistoryEntry,
  b: RunHistoryEntry
): { reproducible: boolean; deltas: ReproDelta[] } {
  const sameInputs =
    a.dataDigest === b.dataDigest &&
    a.randomSeed === b.randomSeed &&
    a.samplingMode === b.samplingMode &&
    a.modelType === b.modelType &&
    a.dataFormat === b.dataFormat &&
    a.rowFrequency === b.rowFrequency &&
    a.nSimulations === b.nSimulations &&
    a.nTrades === b.nTrades;
  if (!sameInputs) return { reproducible: false, deltas: [] };

  // PRNG family is captured on `runMeta`, which is nested under
  // `rawResults` on the persisted entry. Older entries (pre-task-8.3)
  // may be missing the field entirely; treat undefined-vs-undefined as
  // "no mismatch" so legacy comparisons still work, but undefined-vs-
  // populated as a real mismatch.
  const aPrng = a.rawResults?.runMeta?.prngFamily;
  const bPrng = b.rawResults?.runMeta?.prngFamily;
  const prngMismatch = aPrng !== bPrng;

  const fields: Array<keyof RunHistoryEntry['summary']> = [
    'medianFinalBalance',
    'medianMaxDrawdown',
    'var95',
    'cvar95',
    'ruinProbability',
  ];
  const deltas: ReproDelta[] = fields.map((f) => {
    const av = a.summary[f] as number;
    const bv = b.summary[f] as number;
    return { field: f, a: av, b: bv, absDelta: Math.abs(av - bv) };
  });
  if (prngMismatch) {
    deltas.push({
      field: 'prngFamily',
      a: aPrng ?? '(missing)',
      b: bPrng ?? '(missing)',
      absDelta: Infinity,
    });
  }
  // Fixed-seed reproducibility is exact up to floating-point reordering;
  // require summary fields to agree to `REPRO_TOLERANCE * max(1, |a|)`
  // (Requirement 9.7). A `prngFamily` mismatch is a hard fail regardless
  // of the numeric agreement (Requirement 9.2).
  const numericReproducible = deltas
    .filter((d) => d.field !== 'prngFamily')
    .every(
      (d) => d.absDelta < REPRO_TOLERANCE * Math.max(1, Math.abs(Number(d.a)))
    );
  const reproducible = numericReproducible && !prngMismatch;
  return { reproducible, deltas };
}

export function exportRunsAsJson(entries: RunHistoryEntry[]): string {
  return JSON.stringify(entries, null, 2);
}
