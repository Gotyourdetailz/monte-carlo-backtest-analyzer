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
  /** Compressed payload — drops paths but keeps everything else for reproducibility checks. */
  rawResults: Omit<SimulationResults, 'paths'>;
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

/** SHA-256 hex digest of a numeric series — used to detect input drift. */
export async function hashSeries(series: number[]): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    // Best-effort fallback: a non-cryptographic but stable hash
    let h = 0;
    for (let i = 0; i < series.length; i++) {
      // Mix the floating-point bytes
      const buf = new Float64Array([series[i]]);
      const u32 = new Uint32Array(buf.buffer);
      h = Math.imul(h ^ u32[0], 2654435761) >>> 0;
      h = Math.imul(h ^ u32[1], 2654435761) >>> 0;
    }
    return `nonsec-${h.toString(16).padStart(8, '0')}-n${series.length}`;
  }
  const buf = new Float64Array(series);
  const digest = await crypto.subtle.digest('SHA-256', buf.buffer);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function buildEntry(
  results: SimulationResults,
  inputDigest: string
): RunHistoryEntry {
  const verdict = results.modelValidation?.overallVerdict;
  const { paths: _paths, ...rest } = results;
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
    rawResults: rest as Omit<SimulationResults, 'paths'>,
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
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.put(buildEntry(results, inputDigest));
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve(); // best-effort
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
 * Reproducibility check.  Two prior runs are "reproducible peers" if they
 * share input digest, seed, samplingMode, modelType, dataFormat,
 * rowFrequency, nSimulations and nTrades — under those conditions the
 * engine MUST return identical institutional metrics.  Returns the worst
 * absolute discrepancy across the summary numbers.
 */
export type ReproDelta = {
  field: keyof RunHistoryEntry['summary'];
  a: number;
  b: number;
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
  // Allow tiny numerical drift (floating-point reordering). Anything > 1e-3 is
  // a reproducibility break; report it.
  const reproducible = deltas.every((d) => d.absDelta < 1e-3 * Math.max(1, Math.abs(d.a)));
  return { reproducible, deltas };
}

export function exportRunsAsJson(entries: RunHistoryEntry[]): string {
  return JSON.stringify(entries, null, 2);
}
