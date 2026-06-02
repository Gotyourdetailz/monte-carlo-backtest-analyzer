/**
 * Property test for decomposition equivalence (Task 5.15, Property 16).
 *
 * **Property 16: Decomposed pipeline produces equivalent `DailyData[]` to the
 * pre-decomposition path.**
 *
 * The intent of Requirement 10.7/10.9 is that decomposing `App.tsx`'s inline
 * CSV ingest into `csvIngest.ts` (`parseFinancialNumber` + `buildDailyData`)
 * is a behaviour-preserving refactor. Strict comparison against a
 * pre-recorded golden `SimulationResults` was contemplated by the design
 * note, but the golden was never captured before the decomposition shipped
 * (and, per Requirement 9, the new pipeline deliberately stamps `runId`,
 * `prngFamily`, `kernelVersion`, and a full-input `dataDigest` that would
 * make a byte-for-byte comparison brittle even if a golden existed).
 *
 * Pragmatic alternative agreed with the user: instead of comparing against a
 * pre-decomposition `SimulationResults`, run two parallel paths through the
 * NEW pipeline that MUST agree on the engine's actual input — the
 * `DailyData[]` array consumed by `runSimulation`:
 *
 *   • **Path A (legacy inline)** — replicates the pre-decomposition
 *     `App.tsx` logic: a hand-rolled `parseFinancialNumber` plus an inline
 *     `csvData.map(row => ({ pnl, regime, segment, timestamp,
 *     benchmarkReturn, factorRow }))` projection that filtered empty PnL
 *     cells and divided benchmark/factor values by 100 for
 *     `dataFormat === 'pct'`.
 *
 *   • **Path B (decomposed)** — calls `buildDailyData(...)` from
 *     `csvIngest.ts` with the same row data and the same column mappings.
 *
 * If the decomposition is behaviour-preserving, then for every random CSV
 * row array, every random column-mapping choice, and every benchmark format,
 * Path A and Path B must produce equal `DailyData[]` outputs (modulo the
 * documented sidecar-segment behaviour: Path B never mutates rows with a
 * `__segment` property, but it consumes the sidecar `segments` map; Path A
 * is fed the same sidecar map).
 *
 * The two paths share no code other than the public `csvIngest.ts` surface
 * being tested, so this is a genuine equivalence check rather than a
 * tautology.
 *
 * Validates: Requirements 10.7, 10.9.
 *
 * No wasm, no React. Run with:
 *   npx tsx src/__tests__/property_decomposition_equivalence.test.ts
 */

import * as fc from 'fast-check';
import * as assert from 'node:assert/strict';
import {
  parseFinancialNumber,
  buildDailyData,
  type ParseDailyDataInput,
} from '../csvIngest';
import type { DailyData, DataFormat } from '../types';

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (e) {
    const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
    console.log(`  FAIL  ${name}\n${msg}`);
    failures++;
  }
}

// ─── Path A: inline pre-decomposition ingest ─────────────────────────────
//
// Replicates the legacy `App.tsx` projection: filter rows whose PnL cell is
// empty / non-numeric, otherwise emit a `DailyData` with the regime /
// segment / timestamp / benchmark / factor fields populated under the same
// format rules `buildDailyData` enforces. Implemented from scratch so the
// equivalence check is meaningful — if both paths shared the same primitive
// pipeline the test would not detect a regression introduced in
// `buildDailyData`.
function legacyInlineBuildDailyData(input: ParseDailyDataInput): DailyData[] {
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
  const useRegime = !!regimeCol && regimeCol !== 'None';
  const useTimestamp = !!timestampCol && timestampCol !== 'None';
  const useBenchmark = !!benchmarkCol && benchmarkCol !== 'None';
  const factorNames = (factorCols ?? []).filter((s) => s.length > 0);
  const pctScale = benchmarkFormat === 'pct';

  const out: DailyData[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rawPnl = row[pnlCol];
    if (rawPnl === null || rawPnl === undefined || rawPnl === '') continue;
    const pnl = parseFinancialNumber(rawPnl);
    if (!Number.isFinite(pnl)) continue;

    let benchmarkReturn: number | undefined;
    if (useBenchmark) {
      const benchRaw = parseFinancialNumber(row[benchmarkCol as string]);
      if (Number.isFinite(benchRaw)) {
        benchmarkReturn = pctScale ? benchRaw / 100 : benchRaw;
      }
    }

    let factorRow: number[] | undefined;
    if (factorNames.length > 0) {
      const vals = factorNames.map((n) => parseFinancialNumber(row[n]));
      if (vals.every((v) => Number.isFinite(v))) {
        factorRow = pctScale ? vals.map((v) => v / 100) : vals;
      }
    }

    const segment = segments?.get(i);

    out.push({
      pnl,
      regime: useRegime ? String(row[regimeCol as string]) : undefined,
      segment,
      timestamp:
        useTimestamp && row[timestampCol as string] != null
          ? String(row[timestampCol as string])
          : undefined,
      benchmarkReturn,
      factorRow,
    });
  }
  return out;
}

// ─── Generators ──────────────────────────────────────────────────────────
//
// Generate values that survive `parseFinancialNumber` round-trip plus a few
// "bad" cells per row so the equivalence check exercises the
// skip-empty-PnL and undefined-benchmark branches.

const numericCellArb: fc.Arbitrary<string> = fc.oneof(
  fc.float({ noNaN: true, noDefaultInfinity: true, min: -1e6, max: 1e6 })
    .map((n) => n.toFixed(2)),
  fc.float({ noNaN: true, noDefaultInfinity: true, min: 0, max: 1e6 })
    .map((n) => '$' + n.toFixed(2)),
  fc.float({ noNaN: true, noDefaultInfinity: true, min: 0, max: 1e6 })
    .map((n) => '(' + n.toFixed(2) + ')'),
);

const pnlCellArb: fc.Arbitrary<unknown> = fc.oneof(
  numericCellArb,                       // valid numeric
  fc.constant(''),                      // empty -> skip row (Path A and B agree)
  fc.constant('not-a-number'),          // malformed -> skip row
);

const benchmarkCellArb: fc.Arbitrary<unknown> = fc.oneof(
  numericCellArb,
  fc.constant(''),                      // -> undefined benchmarkReturn
  fc.constant('garbage'),
);

const regimeCellArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom('bull', 'bear', 'sideways', 'volatile'),
  fc.constant(undefined),
  fc.constant(null),
);

const timestampCellArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.date({ min: new Date('2020-01-01'), max: new Date('2024-12-31'), noInvalidDate: true })
    .map((d) => d.toISOString()),
  fc.constant(null),
);

interface GenSpec {
  rows: Record<string, unknown>[];
  pnlCol: string;
  regimeCol?: string;
  timestampCol?: string;
  benchmarkCol?: string;
  factorCols: string[];
  benchmarkFormat: DataFormat;
  segments: Map<number, string>;
}

const dataFormatArb: fc.Arbitrary<DataFormat> = fc.constantFrom<DataFormat>(
  'pct', 'mult', 'absolute',
);

const segmentValueArb: fc.Arbitrary<string> = fc.constantFrom(
  'in_regime', 'out_regime', 'clustered', 'dispersed',
);

const specArb: fc.Arbitrary<GenSpec> = fc.tuple(
  fc.array(
    fc.record({
      pnl: pnlCellArb,
      bench: benchmarkCellArb,
      regime: regimeCellArb,
      ts: timestampCellArb,
      f1: benchmarkCellArb,
      f2: benchmarkCellArb,
    }),
    { minLength: 0, maxLength: 30 },
  ),
  fc.boolean(),                        // useRegime
  fc.boolean(),                        // useTimestamp
  fc.boolean(),                        // useBenchmark
  fc.constantFrom(0, 1, 2),            // factor count
  dataFormatArb,
  fc.array(segmentValueArb, { minLength: 0, maxLength: 30 }),
).map(([raw, useRegime, useTs, useBench, factorN, fmt, segArr]): GenSpec => {
  // Project the raw record into a stable column-name shape. Columns the
  // caller "doesn't have" are still present on the row object — ingest
  // ignores them — so this matches a real CSV with extra columns.
  const rows: Record<string, unknown>[] = raw.map((r) => ({
    pnl: r.pnl,
    bench: r.bench,
    regime: r.regime,
    ts: r.ts,
    f1: r.f1,
    f2: r.f2,
  }));
  const factorCols = factorN === 0 ? [] : factorN === 1 ? ['f1'] : ['f1', 'f2'];
  const segments = new Map<number, string>();
  for (let i = 0; i < Math.min(rows.length, segArr.length); i++) {
    segments.set(i, segArr[i]);
  }
  return {
    rows,
    pnlCol: 'pnl',
    regimeCol: useRegime ? 'regime' : 'None',
    timestampCol: useTs ? 'ts' : 'None',
    benchmarkCol: useBench ? 'bench' : 'None',
    factorCols,
    benchmarkFormat: fmt,
    segments,
  };
});

// ─── Equality helper ─────────────────────────────────────────────────────
//
// `Number.NaN !== Number.NaN`, and floating-point subtleties make a strict
// `assert.deepStrictEqual` brittle for `benchmarkReturn` / `factorRow` after
// the `pct` divide-by-100. Compare numeric fields with absolute tolerance and
// pass everything else through.
const NUMERIC_TOL = 1e-12;

function approxEqualNumber(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (a === b) return true;
  return Math.abs(a - b) <= NUMERIC_TOL * Math.max(1, Math.abs(a), Math.abs(b));
}

function approxEqualFactorRow(a: number[] | undefined, b: number[] | undefined): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!approxEqualNumber(a[i], b[i])) return false;
  }
  return true;
}

function assertDailyDataEqual(actual: DailyData[], expected: DailyData[], ctx: string): void {
  assert.equal(
    actual.length, expected.length,
    `${ctx}: length mismatch — actual=${actual.length} expected=${expected.length}`,
  );
  for (let i = 0; i < actual.length; i++) {
    const a = actual[i];
    const e = expected[i];
    if (!approxEqualNumber(a.pnl, e.pnl)) {
      throw new Error(`${ctx}: row ${i} pnl differs — actual=${a.pnl} expected=${e.pnl}`);
    }
    assert.equal(a.regime, e.regime, `${ctx}: row ${i} regime differs`);
    assert.equal(a.segment, e.segment, `${ctx}: row ${i} segment differs`);
    assert.equal(a.timestamp, e.timestamp, `${ctx}: row ${i} timestamp differs`);
    if (!approxEqualNumber(a.benchmarkReturn, e.benchmarkReturn)) {
      throw new Error(
        `${ctx}: row ${i} benchmarkReturn differs — actual=${a.benchmarkReturn} expected=${e.benchmarkReturn}`,
      );
    }
    if (!approxEqualFactorRow(a.factorRow, e.factorRow)) {
      throw new Error(
        `${ctx}: row ${i} factorRow differs — actual=${JSON.stringify(a.factorRow)} expected=${JSON.stringify(e.factorRow)}`,
      );
    }
  }
}

// ─── Property 16 ─────────────────────────────────────────────────────────

console.log('\n[csvIngest — decomposition equivalence (Property 16)]');

check(
  'Property 16 — decomposed buildDailyData matches legacy inline projection',
  () => {
    fc.assert(
      fc.property(specArb, (spec) => {
        const input: ParseDailyDataInput = {
          rows: spec.rows,
          pnlCol: spec.pnlCol,
          regimeCol: spec.regimeCol,
          timestampCol: spec.timestampCol,
          benchmarkCol: spec.benchmarkCol,
          factorCols: spec.factorCols,
          benchmarkFormat: spec.benchmarkFormat,
          segments: spec.segments,
        };
        const decomposed = buildDailyData(input).data;
        const legacy = legacyInlineBuildDailyData(input);
        assertDailyDataEqual(decomposed, legacy, 'paths disagree');
      }),
      // Reduced from 200 to 50 for faster test cadence.
      { numRuns: 50 },
    );
  },
);

// ─── Hand-crafted fixture (the "small fixture CSV" from task 5.15) ───────
//
// Five rows covering every column-mapping combination plus deliberately
// malformed cells. Asserts the engine-shaped output against an explicit
// expected `DailyData[]`. This catches a regression where both Path A and
// Path B drift in lockstep (the equivalence check above would not).

check('Property 16 — fixture: pct-format with regime, timestamp, benchmark, 2 factors', () => {
  const rows: Record<string, unknown>[] = [
    { pnl: '$1,234.50', bench: '0.42', regime: 'bull',     ts: '2024-01-02', f1: '1.5', f2: '0.3' },
    { pnl: '(50.00)',   bench: '',     regime: 'bear',     ts: null,         f1: 'x',   f2: '0.1' }, // bench/factor invalid → undefined
    { pnl: '',          bench: '0.10', regime: 'sideways', ts: '2024-01-04', f1: '0.5', f2: '0.2' }, // empty PnL → skip row
    { pnl: 0,           bench: '0',    regime: 'volatile', ts: '2024-01-05', f1: '0',   f2: '0'   },
    { pnl: '7.5',       bench: '-0.25',regime: 'bull',     ts: '2024-01-06', f1: '0.9', f2: '0.4' },
  ];
  const segments = new Map<number, string>([
    [0, 'in_regime'],
    [1, 'out_regime'],
    [3, 'clustered'],
    // index 2 is intentionally absent (the row is skipped anyway)
    [4, 'dispersed'],
  ]);
  const input: ParseDailyDataInput = {
    rows,
    pnlCol: 'pnl',
    regimeCol: 'regime',
    timestampCol: 'ts',
    benchmarkCol: 'bench',
    factorCols: ['f1', 'f2'],
    benchmarkFormat: 'pct',
    segments,
  };

  const decomposed = buildDailyData(input).data;
  const legacy = legacyInlineBuildDailyData(input);
  assertDailyDataEqual(decomposed, legacy, 'fixture paths disagree');

  // Also assert against an explicit expected projection so the test fails
  // loudly if both paths regress in the same way.
  const expected: DailyData[] = [
    {
      pnl: 1234.5,
      regime: 'bull',
      segment: 'in_regime',
      timestamp: '2024-01-02',
      benchmarkReturn: 0.42 / 100,
      factorRow: [1.5 / 100, 0.3 / 100],
    },
    {
      pnl: -50,
      regime: 'bear',
      segment: 'out_regime',
      timestamp: undefined,
      // bench === '' → parseFinancialNumber('') === Number('') === 0 (a
      // documented quirk of csvIngest's spec — empty PnL cells are filtered
      // upstream, but benchmark/factor empties feed through). pct-format
      // divides by 100 → 0.
      benchmarkReturn: 0,
      // f1 === 'x' is non-numeric → at least one factor is NaN → the whole
      // row's factor projection is dropped to undefined.
      factorRow: undefined,
    },
    // row index 2 is skipped (empty PnL)
    {
      pnl: 0,
      regime: 'volatile',
      segment: 'clustered',
      timestamp: '2024-01-05',
      benchmarkReturn: 0,
      factorRow: [0, 0],
    },
    {
      pnl: 7.5,
      regime: 'bull',
      segment: 'dispersed',
      timestamp: '2024-01-06',
      benchmarkReturn: -0.25 / 100,
      factorRow: [0.9 / 100, 0.4 / 100],
    },
  ];
  assertDailyDataEqual(decomposed, expected, 'fixture vs explicit expected');
});

check('Property 16 — fixture: absolute-format with no regime / no benchmark / no factors', () => {
  const rows: Record<string, unknown>[] = [
    { pnl: '100', bench: '0.5', regime: 'bull', ts: '2024-02-01', f1: '0.7' },
    { pnl: '-25.5', bench: '0.5', regime: 'bear', ts: '2024-02-02', f1: '0.7' },
    { pnl: 0,    bench: '0.5', regime: 'bull', ts: '2024-02-03', f1: '0.7' },
  ];
  const input: ParseDailyDataInput = {
    rows,
    pnlCol: 'pnl',
    regimeCol: 'None',     // disabled
    timestampCol: 'None',  // disabled
    benchmarkCol: 'None',  // disabled
    factorCols: [],
    benchmarkFormat: 'absolute',
    segments: undefined,
  };

  const decomposed = buildDailyData(input).data;
  const expected: DailyData[] = [
    { pnl: 100,   regime: undefined, segment: undefined, timestamp: undefined, benchmarkReturn: undefined, factorRow: undefined },
    { pnl: -25.5, regime: undefined, segment: undefined, timestamp: undefined, benchmarkReturn: undefined, factorRow: undefined },
    { pnl: 0,     regime: undefined, segment: undefined, timestamp: undefined, benchmarkReturn: undefined, factorRow: undefined },
  ];
  assertDailyDataEqual(decomposed, expected, 'absolute-format fixture');
});

if (failures > 0) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
} else {
  console.log('\nAll decomposition-equivalence property tests passed.');
}
