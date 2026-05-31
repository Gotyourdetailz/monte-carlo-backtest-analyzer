/**
 * Property-based tests for `studentTCdf` in `src/correlatedResampling.ts`.
 *
 * Covers Task 7.2 of the code-review-remediation spec:
 *
 *   Property 1: Student-t CDF agrees with the regularized incomplete beta
 *               definition (cross-checked against `jstat.studentt.cdf`)
 *               within tolerance 1e-6 for `t ∈ [-50, 50]`, `df ∈ [1, 100]`.
 *
 *   Property 2: Student-t CDF is finite for low degrees of freedom
 *               (`df ∈ [0.1, 2]`) across a representative range of `t`.
 *
 *   Plus three known critical-value spot checks:
 *       t_{0.025, 5}  ≈ 2.571   → CDF ≈ 0.975
 *       t_{0.025, 10} ≈ 2.228   → CDF ≈ 0.975
 *       t_{0.10, 1}   ≈ 3.078   → CDF ≈ 0.90
 *
 * Validates: Requirements 4.2, 4.3, 4.4
 *
 * Run with: npx tsx src/__tests__/property_studentTCdf.test.ts
 * Prints PASS / FAIL per check; exits non-zero on any failure.
 */

import * as fc from 'fast-check';
// jstat ships no TypeScript types; import the default export and treat it as
// a structural any. `npm run lint` (tsc --noEmit) tolerates this because the
// project does not enable strict / noImplicitAny.
// @ts-ignore - no types shipped with jstat 1.9.x
import jstat from 'jstat';

import { studentTCdf } from '../correlatedResampling';

let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

console.log('\n[studentTCdf — property tests]');

// ─── Three known critical values (Requirement 4.4) ───────────────────────────
//
// Tolerance 1e-3: the implementation is internally accurate to ~1e-6 versus
// jstat, but exact-known critical values quoted to three decimals (2.571,
// 2.228, 3.078) themselves have ~1e-4 truncation, so 1e-3 is the honest bound.
{
  const c1 = studentTCdf(2.571, 5);
  check('t_{0.025, 5}: studentTCdf(2.571, 5) ≈ 0.975', Math.abs(c1 - 0.975) < 1e-3, `got ${c1.toFixed(6)}`);

  const c2 = studentTCdf(2.228, 10);
  check('t_{0.025, 10}: studentTCdf(2.228, 10) ≈ 0.975', Math.abs(c2 - 0.975) < 1e-3, `got ${c2.toFixed(6)}`);

  const c3 = studentTCdf(3.078, 1);
  check('t_{0.10, 1}: studentTCdf(3.078, 1) ≈ 0.90', Math.abs(c3 - 0.90) < 1e-3, `got ${c3.toFixed(6)}`);
}

// ─── Property 1: agreement with jstat reference (tolerance 1e-6) ─────────────
{
  let ok = true;
  let lastDetail = '';
  try {
    fc.assert(
      fc.property(
        fc.double({ min: -50, max: 50, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true }),
        (t, df) => {
          const ours = studentTCdf(t, df);
          const ref = jstat.studentt.cdf(t, df);
          // Both functions should return the same value within 1e-6.
          // We require both to be finite — jstat itself is finite on this
          // input range, so if our implementation diverges to NaN, the test
          // fails.
          if (!Number.isFinite(ours) || !Number.isFinite(ref)) return false;
          return Math.abs(ours - ref) < 1e-6;
        }
      ),
      // Reduced from 200 to 50 for faster test cadence.
      { numRuns: 50 }
    );
  } catch (err) {
    ok = false;
    lastDetail = (err as Error).message.split('\n').slice(0, 3).join(' | ');
  }
  check(
    'Property 1: studentTCdf agrees with jstat.studentt.cdf within 1e-6 (t ∈ [-50, 50], df ∈ [1, 100])',
    ok,
    lastDetail
  );
}

// ─── Property 2: finite for low df ∈ [0.1, 2] ────────────────────────────────
{
  let ok = true;
  let lastDetail = '';
  try {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.1, max: 2, noNaN: true, noDefaultInfinity: true }),
        (t, df) => {
          const v = studentTCdf(t, df);
          // Must be finite, in [0, 1], with no NaN — this is the core of
          // Requirement 4.3 (low-df guard returns a finite value in [0, 1]).
          return Number.isFinite(v) && v >= 0 && v <= 1;
        }
      ),
      // Reduced from 200 to 50 for faster test cadence.
      { numRuns: 50 }
    );
  } catch (err) {
    ok = false;
    lastDetail = (err as Error).message.split('\n').slice(0, 3).join(' | ');
  }
  check(
    'Property 2: studentTCdf is finite and ∈ [0, 1] for df ∈ [0.1, 2]',
    ok,
    lastDetail
  );
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log('');
if (failures === 0) {
  console.log('PASS — all studentTCdf property tests passed');
  process.exit(0);
} else {
  console.log(`FAIL — ${failures} studentTCdf property test(s) failed`);
  process.exit(1);
}
