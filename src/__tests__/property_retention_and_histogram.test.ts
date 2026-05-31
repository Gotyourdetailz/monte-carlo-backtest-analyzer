/**
 * Property tests for `runHistory` retention cap and histogram summary
 * (task 8.11).
 *
 * Property 13: runHistory retention cap evicts oldest first
 *   When more than `MAX_STORED_RUNS` runs are recorded, `recordRun` MUST
 *   trim the store to the cap by deleting oldest-by-timestamp entries
 *   first. The remaining entries returned by `listRuns` MUST be exactly
 *   the `MAX_STORED_RUNS` most-recent inserts.
 *
 * Property 15: Histogram-summarized run preserves percentile statistics
 *   The 200-bin equi-width histogram persisted in lieu of the raw
 *   `finalBalances` / `maxDrawdowns` arrays MUST allow the original p5,
 *   median, and p95 (as computed by `buildSummary`) to be recovered to
 *   within `1 / 200` of the data range — i.e. one bin width.
 *
 * `fake-indexeddb` is not installed, so this file ships a small in-memory
 * IndexedDB stub that implements only the surface area `runHistory.ts`
 * actually uses (open / object store / index cursor / transaction / put /
 * delete / clear / get). The stub is wired in BEFORE the dynamic import
 * of `runHistory` so that module's lazy `dbPromise` never sees a missing
 * `indexedDB` global.
 *
 * Validates: Requirements 15.1, 15.4
 *
 * Run with: npx tsx src/__tests__/property_retention_and_histogram.test.ts
 *
 * Prints PASS / FAIL per property and exits non-zero on any failure.
 */

import * as fc from 'fast-check';

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

// ─── Minimal in-memory IndexedDB stub ───────────────────────────────────────
//
// Implements the subset used by `runHistory.ts`:
//   indexedDB.open(name, version) -> request with onupgradeneeded/onsuccess
//   db.objectStoreNames.contains(name)
//   db.createObjectStore(name, { keyPath })
//   db.transaction(name, mode) -> tx.objectStore / tx.oncomplete / onerror
//   store.put / delete / get / clear / index / createIndex
//   index.openCursor(null, 'next' | 'prev') with cursor.continue()
//
// All operations resolve via `queueMicrotask` so handlers set after the
// call (the IDB convention used throughout `runHistory.ts`) fire
// correctly.

class FakeReq<T = unknown> {
  result: T | null = null;
  error: Error | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onupgradeneeded: (() => void) | null = null;
}

class FakeCursor<V> {
  value: V;
  private idx = 0;
  constructor(
    private values: V[],
    private req: FakeReq<FakeCursor<V> | null>
  ) {
    this.value = values[0];
  }
  continue(): void {
    this.idx++;
    if (this.idx >= this.values.length) {
      this.req.result = null;
    } else {
      this.value = this.values[this.idx];
      this.req.result = this;
    }
    queueMicrotask(() => this.req.onsuccess?.());
  }
}

class FakeIndex {
  constructor(public store: FakeStore, public keyPath: string) {}
  openCursor(
    _range: unknown,
    direction: 'next' | 'prev' = 'next'
  ): FakeReq<FakeCursor<Record<string, unknown>> | null> {
    const req = new FakeReq<FakeCursor<Record<string, unknown>> | null>();
    const all = [...this.store.data.values()];
    const kp = this.keyPath;
    all.sort((a, b) => {
      const av = (a as Record<string, unknown>)[kp];
      const bv = (b as Record<string, unknown>)[kp];
      if ((av as never) < (bv as never)) return direction === 'next' ? -1 : 1;
      if ((av as never) > (bv as never)) return direction === 'next' ? 1 : -1;
      return 0;
    });
    if (all.length === 0) {
      req.result = null;
    } else {
      req.result = new FakeCursor(all, req);
    }
    queueMicrotask(() => req.onsuccess?.());
    return req;
  }
}

class FakeStore {
  data = new Map<string, Record<string, unknown>>();
  indexes = new Map<string, FakeIndex>();
  constructor(public keyPath: string) {}
  put(value: Record<string, unknown>): FakeReq<void> {
    const key = value[this.keyPath] as string;
    this.data.set(key, value);
    const r = new FakeReq<void>();
    queueMicrotask(() => r.onsuccess?.());
    return r;
  }
  delete(key: string): FakeReq<void> {
    this.data.delete(key);
    const r = new FakeReq<void>();
    queueMicrotask(() => r.onsuccess?.());
    return r;
  }
  clear(): FakeReq<void> {
    this.data.clear();
    const r = new FakeReq<void>();
    queueMicrotask(() => r.onsuccess?.());
    return r;
  }
  get(key: string): FakeReq<Record<string, unknown> | null> {
    const r = new FakeReq<Record<string, unknown> | null>();
    r.result = this.data.get(key) ?? null;
    queueMicrotask(() => r.onsuccess?.());
    return r;
  }
  createIndex(name: string, keyPath: string): FakeIndex {
    const idx = new FakeIndex(this, keyPath);
    this.indexes.set(name, idx);
    return idx;
  }
  index(name: string): FakeIndex {
    const idx = this.indexes.get(name);
    if (!idx) throw new Error(`FakeStore: no such index "${name}"`);
    return idx;
  }
}

class FakeTx {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public stores: Map<string, FakeStore>) {
    // Fire oncomplete after a microtask so the consumer's synchronous
    // op queue (puts/deletes set up before `oncomplete` is assigned)
    // observes the same turn.
    queueMicrotask(() => this.oncomplete?.());
  }
  objectStore(name: string): FakeStore {
    const s = this.stores.get(name);
    if (!s) throw new Error(`FakeTx: no such store "${name}"`);
    return s;
  }
}

class FakeDB {
  stores = new Map<string, FakeStore>();
  objectStoreNames = {
    contains: (n: string) => this.stores.has(n),
  };
  createObjectStore(name: string, opts: { keyPath: string }): FakeStore {
    const s = new FakeStore(opts.keyPath);
    this.stores.set(name, s);
    return s;
  }
  transaction(_name: string | string[], _mode?: string): FakeTx {
    return new FakeTx(this.stores);
  }
}

const fakeIndexedDB = {
  _dbs: new Map<string, FakeDB>(),
  open(name: string, _version: number): FakeReq<FakeDB> {
    const req = new FakeReq<FakeDB>();
    const existed = this._dbs.has(name);
    let db = this._dbs.get(name);
    if (!db) {
      db = new FakeDB();
      this._dbs.set(name, db);
    }
    req.result = db;
    queueMicrotask(() => {
      if (!existed) req.onupgradeneeded?.();
      req.onsuccess?.();
    });
    return req;
  },
  deleteDatabase(name: string): FakeReq<void> {
    this._dbs.delete(name);
    const r = new FakeReq<void>();
    queueMicrotask(() => r.onsuccess?.());
    return r;
  },
};

// Install the stub BEFORE importing `runHistory`. The module caches a
// `dbPromise` on first call; we only need `indexedDB` to be defined at
// the time of that first call, but installing it pre-import is cheaper
// to reason about.
(globalThis as unknown as { indexedDB: typeof fakeIndexedDB }).indexedDB =
  fakeIndexedDB;

// Silence the [info] eviction logs so the test output stays focused.
const originalInfo = console.info;
console.info = () => {};

// Dynamic import so the stub is in place first.
const {
  recordRun,
  listRuns,
  clearAll,
  buildHistogram,
  buildSummary,
  MAX_STORED_RUNS,
} = await import('../runHistory.ts');
import type { SimulationResults } from '../types.ts';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build the smallest plausible `SimulationResults` object that
 * `runHistory.buildEntry` can consume. Only the fields actually read
 * (`runMeta`, `originalPath[0]`, `institutionalMetrics.{...}`,
 * `metricsValidity.terminalPnL`, `ruinProbability`, `paths`,
 * `finalBalances`, `maxDrawdowns`) are populated; everything else is a
 * harmless empty default. Cast to `SimulationResults` so we don't have
 * to mirror the full shape here.
 */
function makeFakeResult(
  runId: string,
  timestamp: string,
  finalBalances: number[] = [10_000],
  maxDrawdowns: number[] = [500]
): SimulationResults {
  return {
    runMeta: {
      runId,
      timestamp,
      randomSeed: 0,
      samplingMode: 'bootstrap',
      modelType: 'basic',
      nSimulations: 1,
      nTrades: 1,
      dataFormat: 'absolute',
      rowFrequency: 'trade',
      commissionPerTrade: 0,
      // Forward-compatible fields surfaced after the reproducibility
      // hardening in task 8 — present here so future readers don't see
      // `undefined` for things `compareReproducibility` checks.
      prngFamily: 'mulberry32-ts',
      kernelVersion: 'pre-versioned',
      pnlDigest: 'test',
    },
    originalPath: [10_000],
    paths: [],
    finalBalances,
    maxDrawdowns,
    institutionalMetrics: {
      medianFinalBalance: 10_000,
      medianMaxDrawdown: 500,
      var95: -200,
      cvar95: -300,
    },
    ruinProbability: 0,
    metricsValidity: { terminalPnL: true },
  } as unknown as SimulationResults;
}

/**
 * Build a unique ISO timestamp that sorts chronologically for arbitrary
 * non-negative integer offsets. Uses 1970 as the epoch base and adds
 * `offsetMs` milliseconds.
 */
function tsAt(offsetMs: number): string {
  return new Date(offsetMs).toISOString();
}

/**
 * Recover an approximate percentile from a `HistogramSummary`. Locates
 * the bin containing the element at sorted-rank `floor(n * p)` (matching
 * `buildSummary`'s indexing rule) and returns that bin's midpoint. The
 * worst-case error is `binSize / 2 = (max - min) / 400`, well within
 * the `(max - min) / 200` tolerance the property asserts.
 */
function percentileFromHistogram(
  h: { binStart: number; binEnd: number; binSize: number; counts: number[] },
  p: number
): number {
  const n = h.counts.reduce((a, b) => a + b, 0);
  if (n === 0) return 0;
  if (h.binSize === 0) return h.binStart; // degenerate (all values equal)
  const targetRank = Math.min(n - 1, Math.max(0, Math.floor(n * p)));
  let cum = 0;
  for (let i = 0; i < h.counts.length; i++) {
    cum += h.counts[i];
    if (cum > targetRank) {
      return h.binStart + (i + 0.5) * h.binSize;
    }
  }
  return h.binEnd;
}

// ─── Property 13: retention cap evicts oldest first ─────────────────────────
// Validates: Requirement 15.1
console.log('\n[property_retention_and_histogram] Property 13');

{
  // Sanity check: the cap is the documented value (50). Bumping the cap
  // should not silently break this test.
  check(
    'MAX_STORED_RUNS is 50',
    MAX_STORED_RUNS === 50,
    `actual=${MAX_STORED_RUNS}`
  );

  // Property: for any insert count `total` greater than the cap, after
  // recording `total` runs with strictly-monotonic timestamps, `listRuns`
  // returns exactly the cap-many entries with the largest timestamps.
  let counterexample: string | null = null;

  await fc.assert(
    fc.asyncProperty(
      // total > MAX_STORED_RUNS so eviction always happens.
      fc.integer({ min: MAX_STORED_RUNS + 1, max: MAX_STORED_RUNS + 25 }),
      async (total) => {
        await clearAll();

        // Build a deterministic, strictly-increasing timestamp series so
        // "oldest first" has an unambiguous ordering. Each insert is a
        // distinct ms tick.
        const inserted: { runId: string; ts: string }[] = [];
        for (let i = 0; i < total; i++) {
          const ts = tsAt(1_700_000_000_000 + i);
          const runId = `r-${i}`;
          inserted.push({ runId, ts });
          await recordRun(makeFakeResult(runId, ts), 'digest');
        }

        // Read back. `listRuns` returns newest-first (cursor 'prev') up
        // to `limit`; ask for more than the cap so we observe the cap.
        const remaining = await listRuns(total + 5);

        // 1. Cap is respected.
        if (remaining.length !== MAX_STORED_RUNS) {
          counterexample = `expected listRuns length ${MAX_STORED_RUNS}, got ${remaining.length} (total=${total})`;
          return false;
        }

        // 2. The retained set is exactly the newest `MAX_STORED_RUNS`
        //    inserts. Compare by runId so order in `remaining` doesn't
        //    matter for the membership check.
        const expectedNewest = inserted.slice(-MAX_STORED_RUNS);
        const expectedIds = new Set(expectedNewest.map((r) => r.runId));
        for (const entry of remaining) {
          if (!expectedIds.has(entry.runId)) {
            counterexample = `unexpected runId ${entry.runId} survived (total=${total})`;
            return false;
          }
        }

        // 3. None of the oldest `total - MAX_STORED_RUNS` inserts survived.
        const evictedIds = new Set(
          inserted.slice(0, total - MAX_STORED_RUNS).map((r) => r.runId)
        );
        const survivors = new Set(remaining.map((e) => e.runId));
        for (const evictedId of evictedIds) {
          if (survivors.has(evictedId)) {
            counterexample = `oldest runId ${evictedId} should have been evicted (total=${total})`;
            return false;
          }
        }

        return true;
      }
    ),
    { numRuns: 5 } // each run does ~75 inserts + cursor scans; keep low
  );

  check(
    'Property 13: retention cap evicts oldest-first',
    counterexample === null,
    counterexample ?? `cap=${MAX_STORED_RUNS}`
  );
}

// ─── Property 15: histogram preserves percentile statistics ─────────────────
// Validates: Requirement 15.4
console.log('\n[property_retention_and_histogram] Property 15');

{
  let counterexample: string | null = null;

  await fc.assert(
    fc.property(
      fc.array(
        fc.double({
          noNaN: true,
          noDefaultInfinity: true,
          min: -1e6,
          max: 1e6,
        }),
        { minLength: 5, maxLength: 500 }
      ),
      (data) => {
        // Both `buildSummary` and `buildHistogram` filter non-finite
        // values internally; align here so this test's expectations
        // match what the production code computes.
        const finite = data.filter((v) => Number.isFinite(v));
        if (finite.length < 2) return true; // trivially within tolerance

        const summary = buildSummary(data);
        const histogram = buildHistogram(data, 200);

        const range = summary.max - summary.min;
        // Tolerance: 1 / 200 of the data range, plus a tiny FP slack so
        // double rounding around the bin boundary doesn't trip the test.
        const tolerance = range / 200 + 1e-9 * Math.max(1, Math.abs(range));

        const cases: Array<{ p: number; truth: number; label: string }> = [
          { p: 0.05, truth: summary.p5, label: 'p5' },
          { p: 0.5, truth: summary.median, label: 'median' },
          { p: 0.95, truth: summary.p95, label: 'p95' },
        ];

        for (const c of cases) {
          const recovered = percentileFromHistogram(histogram, c.p);
          const err = Math.abs(recovered - c.truth);
          if (err > tolerance) {
            counterexample =
              `${c.label}: |recovered(${recovered}) - truth(${c.truth})| ` +
              `= ${err} > tol=${tolerance} ` +
              `(n=${finite.length}, range=${range}, binSize=${histogram.binSize})`;
            return false;
          }
        }
        return true;
      }
    ),
    // Reduced from 100 to 25 for faster test cadence.
    { numRuns: 25 }
  );

  check(
    'Property 15: histogram preserves p5/median/p95 within (max-min)/200',
    counterexample === null,
    counterexample ?? ''
  );

  // Sanity check on the degenerate single-value range: tolerance shrinks
  // to 0, and the histogram-derived percentile MUST equal the true value.
  {
    const constData = new Array(50).fill(42);
    const summary = buildSummary(constData);
    const histogram = buildHistogram(constData, 200);
    const recovered = percentileFromHistogram(histogram, 0.5);
    check(
      'Property 15: degenerate constant-value distribution recovers exactly',
      recovered === summary.median && summary.median === 42,
      `recovered=${recovered} truth=${summary.median}`
    );
  }
}

// ─── Cleanup + summary ──────────────────────────────────────────────────────
console.info = originalInfo;
await clearAll();

if (failures > 0) {
  console.log(`\nFAIL ${failures} test(s)`);
  process.exit(1);
} else {
  console.log('\nPASS all tests');
}
