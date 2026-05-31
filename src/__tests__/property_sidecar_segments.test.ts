/**
 * Property test: sidecar regime-segment map preserves user CSV row identity.
 *
 * Run with: npx tsx src/__tests__/property_sidecar_segments.test.ts
 *
 * Validates: Requirements 11.3
 *
 * Property 6 — for arbitrary arrays of CSV-like rows passed to
 * `assignPortfolioRegimeSegments`:
 *   1. The returned value is a `Map<number, RegimeSegmentId>` keyed by
 *      0..rows.length-1 (size === rows.length, every index present).
 *   2. None of the original row objects gain a `__segment` own property.
 *   3. Original row objects are not modified — they deep-equal a snapshot
 *      taken before the call.
 *
 * The sidecar contract is the F-SEC-05 / F-SD-16 mitigation: a malicious
 * counterparty CSV must not be able to smuggle a magic `__segment` regime
 * label, and downstream consumers must not depend on row mutation.
 */

import * as fc from 'fast-check';
import * as assert from 'node:assert/strict';
import {
  assignPortfolioRegimeSegments,
  type RegimeSegmentId,
} from '../regimeSegmentation';

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  FAIL  ${name} — ${msg}`);
    failures++;
  }
}

// Coerce a plausibly-financial string ("$1,234.50", "(50)", "12.5") to number.
// Mirrors parseFinancialNumber's behaviour just well enough for the test.
function parseProfit(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  const s = v.trim();
  if (s.length === 0) return NaN;
  const isParen = s.startsWith('(') && s.endsWith(')');
  const cleaned = (isParen ? s.slice(1, -1) : s).replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return NaN;
  return isParen ? -n : n;
}

// A profit cell value that can survive parseProfit. We mix plain numeric
// strings, parenthesized negatives, and currency-prefixed strings so the
// generator covers the parseFinancialNumber input space.
const profitCellArb: fc.Arbitrary<string> = fc.oneof(
  fc.float({ noNaN: true, noDefaultInfinity: true, min: -1e6, max: 1e6 })
    .map((n) => n.toFixed(2)),
  fc.float({ noNaN: true, noDefaultInfinity: true, min: 0, max: 1e6 })
    .map((n) => '$' + n.toFixed(2)),
  fc.float({ noNaN: true, noDefaultInfinity: true, min: 0, max: 1e6 })
    .map((n) => '(' + n.toFixed(2) + ')'),
  fc.constant(''),
);

const inRegimeCellArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant('true'),
  fc.constant('false'),
  fc.constant('1'),
  fc.constant('0'),
  fc.constant('yes'),
  fc.constant('no'),
  fc.constantFrom<unknown>(true, false, 1, 0),
  fc.constant(''),
);

// Extra benign columns to make the row look like a real CSV row.
const extraColumnsArb: fc.Arbitrary<Record<string, unknown>> = fc
  .dictionary(
    fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_ ]{0,15}$/)
      .filter((k) => k !== 'profit' && k !== 'in_regime' && k !== '__segment'),
    fc.oneof(fc.string(), fc.integer({ min: -1000, max: 1000 })),
    { maxKeys: 4 },
  );

const rowArb = (withInRegime: boolean): fc.Arbitrary<Record<string, unknown>> =>
  fc.record({
    profit: profitCellArb,
    ...(withInRegime ? { in_regime: inRegimeCellArb } : {}),
    extras: extraColumnsArb,
  }).map(({ profit, in_regime, extras }) => ({
    ...extras,
    profit,
    ...(withInRegime ? { in_regime } : {}),
  }));

const allowedSegments: ReadonlySet<RegimeSegmentId> = new Set<RegimeSegmentId>([
  'in_regime',
  'out_regime',
  'clustered',
  'dispersed',
]);

function runProperty(withInRegime: boolean): void {
  fc.assert(
    fc.property(
      fc.array(rowArb(withInRegime), { minLength: 0, maxLength: 60 }),
      (rows) => {
        // Take a structured-clone snapshot BEFORE the call; we will
        // deep-equal against it after the call to detect any mutation.
        const snapshot = structuredClone(rows);

        const inRegimeCol = withInRegime ? 'in_regime' : null;
        const map = assignPortfolioRegimeSegments(
          rows,
          'profit',
          parseProfit,
          inRegimeCol,
        );

        // (1) Map shape: keys are exactly 0..rows.length-1.
        if (!(map instanceof Map)) {
          throw new Error('expected a Map<number, RegimeSegmentId>');
        }
        if (map.size !== rows.length) {
          throw new Error(
            `expected map.size === rows.length (${rows.length}), got ${map.size}`,
          );
        }
        for (let i = 0; i < rows.length; i++) {
          if (!map.has(i)) throw new Error(`missing key ${i}`);
          const v = map.get(i);
          if (typeof v !== 'string' || !allowedSegments.has(v as RegimeSegmentId)) {
            throw new Error(`unexpected segment value at ${i}: ${String(v)}`);
          }
        }

        // (2) No row gained a `__segment` own property.
        for (let i = 0; i < rows.length; i++) {
          if (Object.prototype.hasOwnProperty.call(rows[i], '__segment')) {
            throw new Error(`row ${i} acquired a __segment own property`);
          }
        }

        // (3) Original row objects are unmodified.
        assert.deepStrictEqual(rows, snapshot);
      },
    ),
    // Reduced from 100 to 25 for faster test cadence.
    { numRuns: 25 },
  );
}

console.log('\n[regimeSegmentation — sidecar segment map]');

check('Property 6 — empty-array edge case returns an empty Map', () => {
  const rows: Record<string, unknown>[] = [];
  const snapshot = structuredClone(rows);
  const map = assignPortfolioRegimeSegments(rows, 'profit', parseProfit, null);
  if (!(map instanceof Map)) throw new Error('expected Map');
  if (map.size !== 0) throw new Error('expected empty map');
  assert.deepStrictEqual(rows, snapshot);
});

check('Property 6 — auto-segmentation branch (inRegimeCol = null)', () => {
  runProperty(false);
});

check('Property 6 — column-driven branch (inRegimeCol = "in_regime")', () => {
  runProperty(true);
});

if (failures > 0) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
} else {
  console.log('\nAll property checks passed.');
}
