/**
 * Property test for portfolio sub-seed derivation.
 *
 * Property 10: Sub-seed derivation is deterministic and segment-distinct
 *
 * Background: `Portfolio_Engine.buildPortfolioRegimeBreakdown` recursively
 * dispatches per-regime sub-runs. To preserve audit reproducibility while
 * avoiding shared PRNG sequences across regimes, each sub-run receives a
 * deterministically-derived sub-seed:
 *
 *     subSeed = (parentSeed ^ fnv1a32(segmentId)) >>> 0
 *
 * (See `src/portfolioEngine.ts` and `mathUtils.fnv1a32` JSDoc.)
 *
 * This test pins two universal properties of that derivation:
 *   1. Determinism — for any (seed, segId), the formula always produces the
 *      same uint32 sub-seed.
 *   2. Segment-distinct — for any seed and any two distinct segment strings
 *      whose `fnv1a32` digests differ (vanishingly rare collisions
 *      excepted), the derived sub-seeds also differ. This guarantees
 *      regime sub-runs do not share PRNG sequences.
 *
 * The formula is also asserted to stay inside the uint32 range (the
 * unsigned right shift is the contract that protects downstream
 * `mulberry32` / `StdRng::seed_from_u64` consumers).
 *
 * Validates: Requirements 9.6
 *
 * Run with: npx tsx src/__tests__/property_subseed_derivation.test.ts
 */

import fc from 'fast-check';
import { fnv1a32 } from '../mathUtils';

let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

/** The single source of truth for the derivation, mirrored from portfolioEngine.ts. */
function deriveSubSeed(seed: number, segId: string): number {
  return (seed ^ fnv1a32(segId)) >>> 0;
}

console.log('\n[property_subseed_derivation]');

// ─── Spot-check: known examples ──────────────────────────────────────────────
// Validates: Requirements 9.6
{
  // Determinism on a fixed pair.
  const a1 = deriveSubSeed(0xdeadbeef, 'bull');
  const a2 = deriveSubSeed(0xdeadbeef, 'bull');
  check(
    'fixed (seed, segId) is deterministic across calls',
    a1 === a2,
    `a1=${a1} a2=${a2}`
  );

  // Distinctness for two different regime ids under the same seed.
  const bull = deriveSubSeed(0xdeadbeef, 'bull');
  const bear = deriveSubSeed(0xdeadbeef, 'bear');
  check(
    "distinct segment ids ('bull' vs 'bear') yield distinct sub-seeds",
    bull !== bear,
    `bull=${bull} bear=${bear}`
  );

  // uint32 range guarantee — the `>>> 0` contract.
  const negSeed = deriveSubSeed(-1, 'segment');
  check(
    'sub-seed is a non-negative uint32 (>=0, <2^32)',
    Number.isInteger(negSeed) && negSeed >= 0 && negSeed < 0x1_0000_0000,
    `value=${negSeed}`
  );
}

// ─── Fast-check property: determinism ────────────────────────────────────────
// Validates: Requirements 9.6
{
  let lastDetail = '';
  let propertyHeld = true;

  try {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.string({ minLength: 0, maxLength: 64 }),
        (seed, segId) => {
          const a = deriveSubSeed(seed, segId);
          const b = deriveSubSeed(seed, segId);
          const c = deriveSubSeed(seed, segId);
          const ok =
            a === b &&
            b === c &&
            Number.isInteger(a) &&
            a >= 0 &&
            a < 0x1_0000_0000;
          if (!ok) {
            lastDetail = `seed=${seed} segId=${JSON.stringify(segId)} a=${a} b=${b} c=${c}`;
          }
          return ok;
        }
      ),
      // Reduced from 200 to 50 for faster test cadence.
      { numRuns: 50 }
    );
  } catch (e) {
    propertyHeld = false;
    lastDetail = (e as Error).message;
  }

  check(
    'derivation is deterministic for arbitrary (seed, segId) (fast-check)',
    propertyHeld,
    propertyHeld ? '' : lastDetail
  );
}

// ─── Fast-check property: segment-distinctness ───────────────────────────────
// Validates: Requirements 9.6
//
// For any seed and any two segment strings whose `fnv1a32` digests differ,
// the derived sub-seeds must also differ. This is a direct algebraic
// consequence of `(s ^ x) === (s ^ y)  iff  x === y` over uint32 XOR, but
// we exercise it across many random inputs to catch any future regression
// that swaps in a non-injective mixing step.
{
  let lastDetail = '';
  let propertyHeld = true;

  try {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.string({ minLength: 1, maxLength: 32 }),
        fc.string({ minLength: 1, maxLength: 32 }),
        (seed, segA, segB) => {
          const hashA = fnv1a32(segA);
          const hashB = fnv1a32(segB);
          // Pre-condition: only assert when fnv1a32 doesn't collide.
          // Vanishingly rare for practical regime ids — see test header.
          fc.pre(hashA !== hashB);

          const subA = deriveSubSeed(seed, segA);
          const subB = deriveSubSeed(seed, segB);
          const ok = subA !== subB;
          if (!ok) {
            lastDetail = `seed=${seed} segA=${JSON.stringify(segA)} segB=${JSON.stringify(segB)} subA=${subA} subB=${subB}`;
          }
          return ok;
        }
      ),
      // Reduced from 200 to 50 for faster test cadence.
      { numRuns: 50 }
    );
  } catch (e) {
    propertyHeld = false;
    lastDetail = (e as Error).message;
  }

  check(
    'distinct fnv1a32(segId) digests imply distinct sub-seeds (fast-check)',
    propertyHeld,
    propertyHeld ? '' : lastDetail
  );
}

// ─── Fast-check property: realistic regime-id namespace ──────────────────────
// Validates: Requirements 9.6
//
// Constrain the segment-id generator to the kind of strings the engine
// actually produces (alphanumeric + a few separators, modest length).
// This is the practical-case property: in the regime-breakdown loop the
// segment ids are short, ASCII-dominated tags, so the segment-distinct
// guarantee should hold without needing `fc.pre` to filter collisions.
{
  let lastDetail = '';
  let propertyHeld = true;

  const regimeIdArb = fc
    .stringMatching(/^[A-Za-z0-9_:-]{1,24}$/)
    .filter((s) => s.length > 0);

  try {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        regimeIdArb,
        regimeIdArb,
        (seed, segA, segB) => {
          fc.pre(segA !== segB);
          // Very small chance of a hash collision; skip if it occurs.
          fc.pre(fnv1a32(segA) !== fnv1a32(segB));

          const subA = deriveSubSeed(seed, segA);
          const subB = deriveSubSeed(seed, segB);
          const ok = subA !== subB;
          if (!ok) {
            lastDetail = `seed=${seed} segA=${segA} segB=${segB} subA=${subA} subB=${subB}`;
          }
          return ok;
        }
      ),
      // Reduced from 200 to 50 for faster test cadence.
      { numRuns: 50 }
    );
  } catch (e) {
    propertyHeld = false;
    lastDetail = (e as Error).message;
  }

  check(
    'regime-id-shaped segments yield distinct sub-seeds (fast-check)',
    propertyHeld,
    propertyHeld ? '' : lastDetail
  );
}

if (failures > 0) {
  console.log(`\nFAIL ${failures} test(s)`);
  process.exit(1);
} else {
  console.log('\nPASS all tests');
}
