/**
 * Property tests for the pure seeded-PRNG hero simulation module
 * `../heroSimPaths` (`generateHeroPaths` / `resolveHeroParams`).
 *
 * Feature: webgl-hero, Property 1: Generation is deterministic from the seed
 * Feature: webgl-hero, Property 2: Generation is seed-sensitive
 * Feature: webgl-hero, Property 3: Path matrix is well-formed and finite
 * Feature: webgl-hero, Property 4: Summary series stay within per-step path bounds
 * Feature: webgl-hero, Property 5: Density grid conserves mass and is non-negative
 *
 * Validates: Requirements 1.3, 1.4, 13.1, 13.2, 13.3, 14.1, 14.2, 14.3, 14.4, 14.6
 *
 * Run with: npx tsx src/__tests__/property_heroSimPaths.test.ts
 *
 * Prints PASS / FAIL per check and exits non-zero on any failure. Auto-joins
 * the suite via `run_all.test.ts`. No Jest/Vitest (per tech.md).
 */

import fc from 'fast-check';
import {
  generateHeroPaths,
  resolveHeroParams,
  HERO_SIM_DEFAULTS,
  type HeroSimParams,
} from '../heroSimPaths';

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

console.log('\n[property_heroSimPaths] generateHeroPaths invariants');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Structural deep-equality for the JSON-shaped HeroSimResult (numbers, arrays,
 * and plain objects only). Uses `Object.is` on numbers so identical generation
 * runs must reproduce bit-identical output (including signed zero) — Property 1.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Object.is(a, b);
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as Record<string, unknown>);
    const kb = Object.keys(b as Record<string, unknown>);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) {
        return false;
      }
    }
    return true;
  }
  return a === b;
}

/** True iff every numeric leaf reachable from `x` is finite (no NaN/±Infinity). */
function allNumbersFinite(x: unknown): boolean {
  if (typeof x === 'number') return Number.isFinite(x);
  if (Array.isArray(x)) return x.every(allNumbersFinite);
  if (x && typeof x === 'object') {
    return Object.values(x as Record<string, unknown>).every(allNumbersFinite);
  }
  return true;
}

// ─── Generators ─────────────────────────────────────────────────────────────
// Per the design Testing Strategy: fc.integer seeds, small fc.integer ranges
// for pathCount/steps to keep iterations fast, and reasonable finite ranges for
// the remaining numeric params.

const finiteDouble = (min: number, max: number): fc.Arbitrary<number> =>
  fc.double({ min, max, noNaN: true, noDefaultInfinity: true });

interface ParamArbOptions {
  /** Minimum resolved path count (0 to exercise the degenerate case, 1 otherwise). */
  minPathCount: number;
  /** Force a strictly-positive volatility so seed changes actually diverge (Property 2). */
  positiveVolatility?: boolean;
}

function heroParamsArb(opts: ParamArbOptions): fc.Arbitrary<HeroSimParams> {
  return fc.record({
    seed: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
    pathCount: fc.integer({ min: opts.minPathCount, max: 200 }),
    steps: fc.integer({ min: 1, max: 120 }),
    origin: finiteDouble(-1000, 1000),
    drift: finiteDouble(-5, 5),
    volatility: opts.positiveVolatility ? finiteDouble(0.1, 5) : finiteDouble(0, 5),
    densityBuckets: fc.integer({ min: 1, max: 48 }),
    tailProbability: finiteDouble(0.01, 0.49),
  });
}

// ─── Property 1: Generation is deterministic from the seed ────────────────────
// Calling generateHeroPaths twice with the same params yields deeply-equal
// results (paths, summary, density).
// Validates: Requirements 13.1, 13.2
{
  let lastDetail = '';
  let propertyHeld = true;

  try {
    fc.assert(
      fc.property(heroParamsArb({ minPathCount: 0 }), (params) => {
        const a = generateHeroPaths(params);
        const b = generateHeroPaths(params);
        if (!deepEqual(a, b)) {
          lastDetail = `non-deterministic output for params=${JSON.stringify(params)}`;
          return false;
        }
        return true;
      }),
      { numRuns: 25 },
    );
  } catch (e) {
    propertyHeld = false;
    if (!lastDetail) lastDetail = (e as Error).message;
  }

  check(
    'generateHeroPaths is deterministic: identical params -> deeply-equal results',
    propertyHeld,
    propertyHeld ? '' : lastDetail,
  );
}

// ─── Property 2: Generation is seed-sensitive ─────────────────────────────────
// Two params identical except for distinct seeds differ in at least one path
// point. We force pathCount >= 1, steps >= 1, and volatility > 0 so there ARE
// stochastic path points that can diverge, and we derive the second seed by a
// non-zero offset so the two seeds stay distinct after the PRNG's uint32 coercion.
// Validates: Requirements 13.3
{
  let lastDetail = '';
  let propertyHeld = true;

  const seedSensitiveArb = fc.record({
    params: heroParamsArb({ minPathCount: 1, positiveVolatility: true }),
    seedOffset: fc.integer({ min: 1, max: 1000 }),
  });

  try {
    fc.assert(
      fc.property(seedSensitiveArb, ({ params, seedOffset }) => {
        const seedA = (params.seed >>> 0);
        // seedA < 2^31 and offset <= 1000 keep the sum < 2^32, so the two seeds
        // remain distinct uint32 values (createSeededRng applies `>>> 0`).
        const seedB = (seedA + seedOffset) >>> 0;
        if (seedA === seedB) return true; // unreachable, but keeps the check honest

        const a = generateHeroPaths({ ...params, seed: seedA });
        const b = generateHeroPaths({ ...params, seed: seedB });

        let differs = false;
        outer: for (let i = 0; i < a.paths.length; i++) {
          const pa = a.paths[i];
          const pb = b.paths[i];
          for (let t = 0; t < pa.length; t++) {
            if (!Object.is(pa[t], pb[t])) {
              differs = true;
              break outer;
            }
          }
        }

        if (!differs) {
          lastDetail =
            `seeds ${seedA}/${seedB} produced identical paths for ` +
            `params=${JSON.stringify(params)}`;
          return false;
        }
        return true;
      }),
      { numRuns: 25 },
    );
  } catch (e) {
    propertyHeld = false;
    if (!lastDetail) lastDetail = (e as Error).message;
  }

  check(
    'generateHeroPaths is seed-sensitive: distinct seeds differ in >= 1 path point',
    propertyHeld,
    propertyHeld ? '' : lastDetail,
  );
}

// ─── Property 3: Path matrix is well-formed and finite ────────────────────────
// Exactly N paths, each T+1 points, every path[i][0] === origin, and every
// emitted numeric value (path points, summary series, density counts/density,
// grid min/max) is finite. Includes the N=0 degenerate case.
// Validates: Requirements 14.1, 14.2, 14.6
{
  let lastDetail = '';
  let propertyHeld = true;

  try {
    fc.assert(
      fc.property(heroParamsArb({ minPathCount: 0 }), (params) => {
        const resolved = resolveHeroParams(params);
        const N = resolved.pathCount;
        const T = resolved.steps;
        const result = generateHeroPaths(params);

        // Exactly N paths.
        if (result.paths.length !== N) {
          lastDetail = `expected N=${N} paths, got ${result.paths.length}`;
          return false;
        }
        // Each path has exactly T+1 points and starts at the common origin.
        for (let i = 0; i < result.paths.length; i++) {
          const path = result.paths[i];
          if (path.length !== T + 1) {
            lastDetail = `path ${i} has ${path.length} points, expected ${T + 1}`;
            return false;
          }
          if (!Object.is(path[0], resolved.origin)) {
            lastDetail = `path ${i} origin=${path[0]} !== ${resolved.origin}`;
            return false;
          }
        }

        // Every emitted numeric value is finite.
        const finiteTargets: unknown[] = [
          result.paths,
          result.summary.median,
          result.summary.varBand,
          result.summary.cvarBand,
          result.density.counts,
          result.density.density,
          result.density.min,
          result.density.max,
        ];
        if (!finiteTargets.every(allNumbersFinite)) {
          lastDetail = `non-finite value emitted for params=${JSON.stringify(params)}`;
          return false;
        }
        return true;
      }),
      { numRuns: 25 },
    );
  } catch (e) {
    propertyHeld = false;
    if (!lastDetail) lastDetail = (e as Error).message;
  }

  check(
    'path matrix is well-formed (N x (T+1), common origin) and entirely finite',
    propertyHeld,
    propertyHeld ? '' : lastDetail,
  );
}

// ─── Property 4: Summary series stay within per-step path bounds ──────────────
// At every step t, median[t], varBand[t], cvarBand[t] each lie within
// [min_i paths[i][t], max_i paths[i][t]]. Requires N >= 1 to be meaningful.
// Validates: Requirements 1.3, 14.3
{
  let lastDetail = '';
  let propertyHeld = true;

  try {
    fc.assert(
      fc.property(heroParamsArb({ minPathCount: 1 }), (params) => {
        const result = generateHeroPaths(params);
        const { paths, summary } = result;
        const pointCount = paths[0].length;

        for (let t = 0; t < pointCount; t++) {
          let lo = Infinity;
          let hi = -Infinity;
          for (let i = 0; i < paths.length; i++) {
            const v = paths[i][t];
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
          const series: Array<[string, number]> = [
            ['median', summary.median[t]],
            ['varBand', summary.varBand[t]],
            ['cvarBand', summary.cvarBand[t]],
          ];
          for (const [name, value] of series) {
            if (value < lo || value > hi) {
              lastDetail =
                `${name}[${t}]=${value} outside [${lo}, ${hi}] for ` +
                `params=${JSON.stringify(params)}`;
              return false;
            }
          }
        }
        return true;
      }),
      { numRuns: 25 },
    );
  } catch (e) {
    propertyHeld = false;
    if (!lastDetail) lastDetail = (e as Error).message;
  }

  check(
    'summary series (median/varBand/cvarBand) stay within per-step path bounds',
    propertyHeld,
    propertyHeld ? '' : lastDetail,
  );
}

// ─── Property 5: Density grid conserves mass and is non-negative ──────────────
// Every density cell >= 0, and for every step t the per-step counts sum to
// exactly N. Includes N=0 (all counts 0, sum 0 === N; all densities 0).
// Validates: Requirements 1.4, 14.4
{
  let lastDetail = '';
  let propertyHeld = true;

  try {
    fc.assert(
      fc.property(heroParamsArb({ minPathCount: 0 }), (params) => {
        const resolved = resolveHeroParams(params);
        const N = resolved.pathCount;
        const { density } = generateHeroPaths(params);

        for (let t = 0; t < density.counts.length; t++) {
          const rowCounts = density.counts[t];
          const rowDensity = density.density[t];

          let sum = 0;
          for (let b = 0; b < rowCounts.length; b++) {
            sum += rowCounts[b];
          }
          if (sum !== N) {
            lastDetail = `counts[${t}] sum=${sum} !== N=${N}`;
            return false;
          }
          for (let b = 0; b < rowDensity.length; b++) {
            if (!(rowDensity[b] >= 0)) {
              lastDetail = `density[${t}][${b}]=${rowDensity[b]} is negative/NaN`;
              return false;
            }
          }
        }
        return true;
      }),
      { numRuns: 25 },
    );
  } catch (e) {
    propertyHeld = false;
    if (!lastDetail) lastDetail = (e as Error).message;
  }

  check(
    'density grid conserves mass (per-step counts sum to N) and is non-negative',
    propertyHeld,
    propertyHeld ? '' : lastDetail,
  );
}

// ─── Sanity examples ──────────────────────────────────────────────────────────
// Fixed cases pinning each property for obvious regressions, using the
// documented defaults.
{
  const base: HeroSimParams = {
    seed: HERO_SIM_DEFAULTS.seed,
    pathCount: 16,
    steps: 8,
  };

  // P1 — determinism.
  check(
    'determinism: two default-seeded runs are deeply equal',
    deepEqual(generateHeroPaths(base), generateHeroPaths(base)),
  );

  // P2 — seed sensitivity.
  {
    const a = generateHeroPaths({ ...base, seed: 1 });
    const b = generateHeroPaths({ ...base, seed: 2 });
    const same = deepEqual(a.paths, b.paths);
    check('seed sensitivity: seed 1 vs 2 produce different paths', !same);
  }

  // P3 — shape and finiteness.
  {
    const r = generateHeroPaths(base);
    const shapeOk =
      r.paths.length === 16 &&
      r.paths.every((p) => p.length === 9 && Object.is(p[0], HERO_SIM_DEFAULTS.origin));
    check('shape: 16 paths x 9 points, all from origin 0', shapeOk);
    check('finiteness: all default-run path points are finite', allNumbersFinite(r.paths));
  }

  // P3 — N=0 degenerate case stays finite and well-formed.
  {
    const r = generateHeroPaths({ seed: 1, pathCount: 0, steps: 4 });
    check('N=0: zero paths emitted', r.paths.length === 0);
    check('N=0: density counts all sum to 0', r.density.counts.every((row) => row.reduce((s, c) => s + c, 0) === 0));
    check('N=0: summary falls back to finite origin', allNumbersFinite(r.summary));
  }

  // P5 — mass conservation on a concrete grid.
  {
    const r = generateHeroPaths({ seed: 7, pathCount: 32, steps: 10, densityBuckets: 12 });
    const conserves = r.density.counts.every((row) => row.reduce((s, c) => s + c, 0) === 32);
    const nonNeg = r.density.density.every((row) => row.every((d) => d >= 0));
    check('mass conservation: every step counts sum to 32', conserves);
    check('non-negative: every density cell >= 0', nonNeg);
  }
}

if (failures > 0) {
  console.log(`\n[property_heroSimPaths] ${failures} check(s) failed`);
  process.exit(1);
}

console.log('\n[property_heroSimPaths] all checks passed');
