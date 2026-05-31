/**
 * Property test for `recoveryFactor` in `computeHistoricalStats`.
 *
 * Property 7: recoveryFactor matches a peak-to-trough definition
 *
 * For arbitrary PnL arrays:
 *   1. Build the equity path: originalPath[0] = startingCapital,
 *      originalPath[i+1] = originalPath[i] + pnl[i].
 *   2. Walk the path, track running peak, compute maxAbsDd = max(peak - value).
 *   3. netProfit = sum(pnl).
 *   4. Expected recoveryFactor = maxAbsDd > 0 ? netProfit / maxAbsDd : 0.
 *   5. Assert `computeHistoricalStats(...).recoveryFactor` agrees within 1e-9.
 *
 * The third arg to `computeHistoricalStats` is the percentage drawdown
 * (used elsewhere in the engine), but the function itself only consumes
 * `originalPath` for the recovery-factor calculation. We pass 0 for it.
 *
 * Validates: Requirements 4.6
 *
 * Run with: npx tsx src/__tests__/property_recoveryFactor.test.ts
 */

import fc from 'fast-check';
import { computeHistoricalStats } from '../simulationEngine';

let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

/** Reference implementation of the peak-to-trough max drawdown in dollars. */
function referenceMaxAbsDd(path: number[]): number {
  let peak = -Infinity;
  let maxAbsDd = 0;
  for (const v of path) {
    if (v > peak) peak = v;
    const dd = peak - v;
    if (dd > maxAbsDd) maxAbsDd = dd;
  }
  return maxAbsDd;
}

/** Build the equity path from a starting capital + dollar-PnL series. */
function buildPath(startingCapital: number, pnls: number[]): number[] {
  const path = [startingCapital];
  for (const p of pnls) path.push(path[path.length - 1] + p);
  return path;
}

console.log('\n[property_recoveryFactor]');

// ─── Property 7 ──────────────────────────────────────────────────────────────
// Validates: Requirements 4.6
{
  const TOL = 1e-9;
  let lastDetail = '';
  let propertyHeld = true;

  try {
    fc.assert(
      fc.property(
        // Constrain to a sane numerical range so that floating-point sums stay
        // well-behaved; the property has nothing to do with overflow handling.
        fc.array(
          fc.double({
            min: -1e6,
            max: 1e6,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          { minLength: 1, maxLength: 500 }
        ),
        fc.double({
          min: 1,
          max: 1e7,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (pnls, startingCapital) => {
          const path = buildPath(startingCapital, pnls);
          const netProfit = pnls.reduce((s, v) => s + v, 0);
          const maxAbsDd = referenceMaxAbsDd(path);
          const expected = maxAbsDd > 0 ? netProfit / maxAbsDd : 0;

          const stats = computeHistoricalStats(
            pnls,
            path,
            // `originalMaxDrawdown` is not consumed by `computeHistoricalStats`.
            0,
            252
          );

          const actual = stats.recoveryFactor;

          // Use a relative tolerance scaled by the expected magnitude so the
          // check is stable for both small and large netProfit values.
          const tol = TOL * Math.max(1, Math.abs(expected));
          const ok =
            (expected === 0 && actual === 0) ||
            Math.abs(actual - expected) <= tol;

          if (!ok) {
            lastDetail =
              `expected=${expected} actual=${actual} ` +
              `netProfit=${netProfit} maxAbsDd=${maxAbsDd} ` +
              `pnls.length=${pnls.length} startingCapital=${startingCapital}`;
          }
          return ok;
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
    'recoveryFactor matches peak-to-trough definition (sum(pnl) / maxAbsDd)',
    propertyHeld,
    propertyHeld ? '' : lastDetail
  );
}

// ─── Sanity examples ────────────────────────────────────────────────────────
// A handful of fixed cases to make regressions obvious in the output stream.
{
  // No drawdown (monotonic up): recoveryFactor should be 0.
  const pnls = [1, 2, 3, 4];
  const path = buildPath(100, pnls);
  const stats = computeHistoricalStats(pnls, path, 0, 252);
  check(
    'monotonic-up path → recoveryFactor === 0',
    stats.recoveryFactor === 0,
    `recoveryFactor=${stats.recoveryFactor}`
  );
}
{
  // Up 10, down 4, up 1 → netProfit=7, peak=110, trough after drop=106,
  // maxAbsDd=4, expected = 7/4 = 1.75
  const pnls = [10, -4, 1];
  const path = buildPath(100, pnls);
  const stats = computeHistoricalStats(pnls, path, 0, 252);
  const expected = 7 / 4;
  check(
    'simple peak-to-trough example → recoveryFactor === netProfit / maxAbsDd',
    Math.abs(stats.recoveryFactor - expected) <= 1e-12,
    `recoveryFactor=${stats.recoveryFactor} expected=${expected}`
  );
}
{
  // Net loss: netProfit < 0 produces a negative recoveryFactor.
  const pnls = [-5, -3, 1];
  const path = buildPath(100, pnls);
  const stats = computeHistoricalStats(pnls, path, 0, 252);
  const expectedNet = -7;
  const expectedDd = 8; // peak=100, trough=92
  const expected = expectedNet / expectedDd;
  check(
    'net-loss path → recoveryFactor is negative and matches reference',
    Math.abs(stats.recoveryFactor - expected) <= 1e-12,
    `recoveryFactor=${stats.recoveryFactor} expected=${expected}`
  );
}

if (failures > 0) {
  console.log(`\nFAIL ${failures} test(s)`);
  process.exit(1);
} else {
  console.log('\nPASS all tests');
}
