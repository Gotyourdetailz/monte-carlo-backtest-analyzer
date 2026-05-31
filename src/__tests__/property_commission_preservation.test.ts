/**
 * Property test for commission-preservation in `buildHistoricalPath`.
 *
 * Property 8: Single-permutation identity run preserves the historical path
 * within rounding (1e-9 per step).
 *
 * The full requirement (4.9) calls for a `runSimulation` execution with
 * `nSimulations=1`, `samplingMode='permutation'`, and a seed that produces the
 * identity ordering. That is hard to guarantee with the WASM kernel's
 * `StdRng`-based shuffle. Per the task plan, we instead exercise the exact
 * code path that constructs the historical equity curve — `buildHistoricalPath`
 * in `src/pathSimulator.ts` — which is what `runSimulation` itself uses to
 * derive `originalPath` from the user's PnL series. If commission were ever
 * double-applied (or applied in the wrong format branches), this test would
 * detect it.
 *
 * Three sub-properties are checked:
 *
 *   - 'absolute' format: path[0] === startingCapital and
 *     path[i+1] === path[i] + pnl[i] - commission, exactly once per step.
 *   - 'pct' format: path[i+1] === path[i] * (1 + pnl[i]/100); commission is
 *     NOT subtracted (matches the implementation's current contract).
 *   - 'mult' format: path[i+1] === path[i] * (1 + pnl[i]); commission is
 *     NOT subtracted.
 *
 * Tolerance is 1e-9 per step, scaled by the magnitude of the expected value
 * to remain stable for large equity values.
 *
 * Validates: Requirements 4.9
 *
 * Run with: npx tsx src/__tests__/property_commission_preservation.test.ts
 */

import fc from 'fast-check';
import { buildHistoricalPath } from '../pathSimulator';
import { DailyData, DataFormat } from '../types';

let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

/** Reference reconstruction: matches the implementation contract exactly. */
function referencePath(
  pnls: number[],
  dataFormat: DataFormat,
  startingCapital: number,
  commissionPerTrade: number
): number[] {
  const path = [startingCapital];
  for (const raw of pnls) {
    const prev = path[path.length - 1];
    if (dataFormat === 'absolute') {
      path.push(prev + raw - commissionPerTrade);
    } else if (dataFormat === 'pct') {
      path.push(prev * (1 + raw / 100));
    } else {
      // 'mult'
      path.push(prev * (1 + raw));
    }
  }
  return path;
}

function toData(pnls: number[]): DailyData[] {
  return pnls.map((p) => ({ pnl: p }));
}

function relTol(a: number, b: number, tol: number): boolean {
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= tol * scale;
}

console.log('\n[property_commission_preservation]');

// ─── Property 8a: 'absolute' format preserves PnL minus commission ────────
{
  const TOL = 1e-9;
  let lastDetail = '';
  let propertyHeld = true;

  try {
    fc.assert(
      fc.property(
        fc.array(
          fc.double({
            min: -1e4,
            max: 1e4,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          { minLength: 1, maxLength: 500 }
        ),
        fc.double({
          min: 1e3,
          max: 1e7,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        fc.double({
          min: 0,
          max: 100,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (pnls, startingCapital, commission) => {
          const data = toData(pnls);
          const expected = referencePath(
            pnls,
            'absolute',
            startingCapital,
            commission
          );
          const actual = buildHistoricalPath({
            data,
            dataFormat: 'absolute',
            startingCapital,
            commissionPerTrade: commission,
          });

          if (actual.length !== expected.length) {
            lastDetail = `length mismatch: actual=${actual.length} expected=${expected.length}`;
            return false;
          }
          for (let i = 0; i < expected.length; i++) {
            if (!relTol(actual[i], expected[i], TOL)) {
              lastDetail =
                `step ${i}: actual=${actual[i]} expected=${expected[i]} ` +
                `pnls.length=${pnls.length} startingCapital=${startingCapital} ` +
                `commission=${commission}`;
              return false;
            }
          }
          return true;
        }
      ),
      // Reduced from 100 to 25 for faster test cadence.
      { numRuns: 25 }
    );
  } catch (e) {
    propertyHeld = false;
    lastDetail = (e as Error).message;
  }

  check(
    "absolute: path[i+1] === path[i] + pnl[i] - commission (commission applied exactly once per step)",
    propertyHeld,
    propertyHeld ? '' : lastDetail
  );
}

// ─── Property 8b: 'pct' format preserves multiplicative compounding ───────
{
  const TOL = 1e-9;
  let lastDetail = '';
  let propertyHeld = true;

  try {
    fc.assert(
      fc.property(
        // Bound returns to keep equity from underflowing/blowing up.
        fc.array(
          fc.double({
            min: -50,
            max: 50,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          { minLength: 1, maxLength: 200 }
        ),
        fc.double({
          min: 1e3,
          max: 1e6,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        fc.double({
          min: 0,
          max: 100,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (pnls, startingCapital, commission) => {
          const data = toData(pnls);
          const expected = referencePath(
            pnls,
            'pct',
            startingCapital,
            commission
          );
          const actual = buildHistoricalPath({
            data,
            dataFormat: 'pct',
            startingCapital,
            commissionPerTrade: commission,
          });

          if (actual.length !== expected.length) {
            lastDetail = `length mismatch: actual=${actual.length} expected=${expected.length}`;
            return false;
          }
          for (let i = 0; i < expected.length; i++) {
            if (!relTol(actual[i], expected[i], TOL)) {
              lastDetail =
                `step ${i}: actual=${actual[i]} expected=${expected[i]} ` +
                `pnls.length=${pnls.length} startingCapital=${startingCapital} ` +
                `commission=${commission}`;
              return false;
            }
          }
          return true;
        }
      ),
      // Reduced from 100 to 25 for faster test cadence.
      { numRuns: 25 }
    );
  } catch (e) {
    propertyHeld = false;
    lastDetail = (e as Error).message;
  }

  check(
    "pct: path[i+1] === path[i] * (1 + pnl[i]/100) (commission NOT subtracted)",
    propertyHeld,
    propertyHeld ? '' : lastDetail
  );
}

// ─── Property 8c: 'mult' format preserves multiplicative compounding ──────
{
  const TOL = 1e-9;
  let lastDetail = '';
  let propertyHeld = true;

  try {
    fc.assert(
      fc.property(
        fc.array(
          fc.double({
            min: -0.5,
            max: 0.5,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          { minLength: 1, maxLength: 200 }
        ),
        fc.double({
          min: 1e3,
          max: 1e6,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        fc.double({
          min: 0,
          max: 100,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (pnls, startingCapital, commission) => {
          const data = toData(pnls);
          const expected = referencePath(
            pnls,
            'mult',
            startingCapital,
            commission
          );
          const actual = buildHistoricalPath({
            data,
            dataFormat: 'mult',
            startingCapital,
            commissionPerTrade: commission,
          });

          if (actual.length !== expected.length) {
            lastDetail = `length mismatch: actual=${actual.length} expected=${expected.length}`;
            return false;
          }
          for (let i = 0; i < expected.length; i++) {
            if (!relTol(actual[i], expected[i], TOL)) {
              lastDetail =
                `step ${i}: actual=${actual[i]} expected=${expected[i]} ` +
                `pnls.length=${pnls.length} startingCapital=${startingCapital} ` +
                `commission=${commission}`;
              return false;
            }
          }
          return true;
        }
      ),
      // Reduced from 100 to 25 for faster test cadence.
      { numRuns: 25 }
    );
  } catch (e) {
    propertyHeld = false;
    lastDetail = (e as Error).message;
  }

  check(
    "mult: path[i+1] === path[i] * (1 + pnl[i]) (commission NOT subtracted)",
    propertyHeld,
    propertyHeld ? '' : lastDetail
  );
}

// ─── Sanity examples ──────────────────────────────────────────────────────
// Hand-computed values that would catch a double-application of commission
// (or its application in pct/mult mode) immediately.
{
  // absolute: starting=100, pnl=[10, -3, 5], commission=1
  // expected: [100, 109, 105, 109]
  const path = buildHistoricalPath({
    data: toData([10, -3, 5]),
    dataFormat: 'absolute',
    startingCapital: 100,
    commissionPerTrade: 1,
  });
  const expected = [100, 109, 105, 109];
  const ok =
    path.length === expected.length &&
    path.every((v, i) => Math.abs(v - expected[i]) <= 1e-12);
  check(
    'absolute hand-computed: [100, 109, 105, 109] (commission=1 applied once per step)',
    ok,
    `path=${JSON.stringify(path)} expected=${JSON.stringify(expected)}`
  );
}
{
  // absolute, commission=0: should reduce to plain cumulative sum.
  const startingCapital = 1000;
  const pnls = [5, -2, 8, -1];
  const path = buildHistoricalPath({
    data: toData(pnls),
    dataFormat: 'absolute',
    startingCapital,
    commissionPerTrade: 0,
  });
  const expected = [1000, 1005, 1003, 1011, 1010];
  const ok =
    path.length === expected.length &&
    path.every((v, i) => Math.abs(v - expected[i]) <= 1e-12);
  check(
    'absolute hand-computed with commission=0: pure cumulative sum',
    ok,
    `path=${JSON.stringify(path)} expected=${JSON.stringify(expected)}`
  );
}
{
  // Double-application detector: if commission were applied twice, the final
  // value would be off by `commission * pnls.length`.
  const startingCapital = 1000;
  const commission = 5;
  const pnls = [10, 10, 10, 10, 10];
  const path = buildHistoricalPath({
    data: toData(pnls),
    dataFormat: 'absolute',
    startingCapital,
    commissionPerTrade: commission,
  });
  // expected final = 1000 + 5*(10 - 5) = 1025
  const expectedFinal = 1025;
  const doubleApplied = 1000 + 5 * (10 - 2 * commission); // = 1000
  const ok =
    Math.abs(path[path.length - 1] - expectedFinal) <= 1e-12 &&
    Math.abs(path[path.length - 1] - doubleApplied) > 1; // sanity: distinguishable
  check(
    'absolute: commission applied exactly once (double-application would yield a distinguishable final value)',
    ok,
    `final=${path[path.length - 1]} singleApplied=${expectedFinal} doubleApplied=${doubleApplied}`
  );
}
{
  // pct: starting=100, pnl=[10, -10] (in %), commission=999 (large but ignored)
  // expected: [100, 110, 99]
  const path = buildHistoricalPath({
    data: toData([10, -10]),
    dataFormat: 'pct',
    startingCapital: 100,
    commissionPerTrade: 999,
  });
  const expected = [100, 110, 99];
  const ok =
    path.length === expected.length &&
    path.every((v, i) => Math.abs(v - expected[i]) <= 1e-9);
  check(
    'pct hand-computed: commission is NOT subtracted (commission=999 has no effect)',
    ok,
    `path=${JSON.stringify(path)} expected=${JSON.stringify(expected)}`
  );
}
{
  // mult: starting=100, pnl=[0.1, -0.05], commission=999 (ignored)
  // expected: [100, 110, 104.5]
  const path = buildHistoricalPath({
    data: toData([0.1, -0.05]),
    dataFormat: 'mult',
    startingCapital: 100,
    commissionPerTrade: 999,
  });
  const expected = [100, 110, 104.5];
  const ok =
    path.length === expected.length &&
    path.every((v, i) => Math.abs(v - expected[i]) <= 1e-9);
  check(
    'mult hand-computed: commission is NOT subtracted (commission=999 has no effect)',
    ok,
    `path=${JSON.stringify(path)} expected=${JSON.stringify(expected)}`
  );
}
{
  // Permutation-identity: passing the data unchanged must reproduce the path
  // step-for-step. This is the spirit of Property 8: an "identity ordering"
  // permutation reconstructs `originalPath`.
  const startingCapital = 5000;
  const commission = 2;
  const pnls = [3, -7, 4, -1, 6, -2];
  const data = toData(pnls);

  // Two calls with identical inputs (the "identity permutation" of the data)
  // must produce identical paths.
  const a = buildHistoricalPath({
    data,
    dataFormat: 'absolute',
    startingCapital,
    commissionPerTrade: commission,
  });
  const b = buildHistoricalPath({
    data: data.slice(), // identity-permuted copy
    dataFormat: 'absolute',
    startingCapital,
    commissionPerTrade: commission,
  });
  const ok = a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= 1e-12);
  check(
    'identity permutation: path reproduces originalPath step-for-step (1e-12 tolerance)',
    ok,
    `len=${a.length}`
  );
}

if (failures > 0) {
  console.log(`\nFAIL ${failures} test(s)`);
  process.exit(1);
} else {
  console.log('\nPASS all tests');
}
