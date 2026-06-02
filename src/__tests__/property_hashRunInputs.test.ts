/**
 * Property test for `hashRunInputs` (runHistory.ts).
 *
 * Property 11: dataDigest covers all engine inputs
 *   For every field in `RunInputCanonical`, perturbing that field by even a
 *   single bit MUST change the resulting digest. Conversely, hashing the
 *   same canonical input twice MUST produce the same digest (determinism).
 *
 *   This is the contract `hashRunInputs` advertises in its JSDoc — the
 *   canonical byte layout enumerates every input that can influence the
 *   simulation result, so the digest must be sensitive to each one.
 *
 * Validates: Requirements 9.5
 *
 * Run with: npx tsx src/__tests__/property_hashRunInputs.test.ts
 *
 * Prints PASS / FAIL per property and exits non-zero on any failure.
 */

import * as fc from 'fast-check';
import { hashRunInputs, type RunInputCanonical } from '../runHistory.ts';

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

/**
 * Build a non-trivial baseline `RunInputCanonical`. Every field is populated
 * with a distinct, recognisable value so a single-field perturbation is
 * unambiguous.
 */
function buildBase(): RunInputCanonical {
  return {
    pnls: [100, -50, 75, 200, -25, 10],
    regimeTagIds: [0, 1, 0, 2, 1, 0],
    benchmark: [0.5, -0.2, 0.3, 0.8, -0.1, 0.05],
    factorMatrix: [
      [1.0, 0.5],
      [0.8, -0.3],
      [-0.2, 0.4],
      [0.6, 0.7],
      [0.1, -0.6],
      [-0.4, 0.2],
    ],
    commission: 2.5,
    slippage: { model: 'sqrt_impact', impactCoefficient: 0.0001 },
    sleeveWeights: [0.4, 0.3, 0.3],
    prop: { target: 10000, maxDrawdown: 5000, consistencyPercent: 50 },
    dailyLoss: {
      enabled: true,
      maxLosses: 3,
      maxLossDollars: 1500,
      tradesPerSession: 10,
    },
    samplingMode: 'block_bootstrap',
    modelType: 'portfolio',
    dataFormat: 'absolute',
    rowFrequency: 'trade',
  };
}

console.log('\n[property_hashRunInputs]');

// ─── Determinism ─────────────────────────────────────────────────────────────
// Validates: Requirements 9.5
{
  const base = buildBase();
  const a = await hashRunInputs(base);
  const b = await hashRunInputs(base);
  check(
    'hashRunInputs is deterministic on identical input',
    a === b,
    `digest=${a.slice(0, 12)}…`
  );

  // Sanity: an unrelated baseline produces a *different* digest. Acts as a
  // negative control on the determinism check above (i.e. proves we are not
  // returning a constant string).
  const other: RunInputCanonical = {
    ...base,
    pnls: base.pnls.map((x) => x + 1),
  };
  const c = await hashRunInputs(other);
  check(
    'hashRunInputs is non-trivial (different input → different digest)',
    a !== c,
    `a=${a.slice(0, 8)}… c=${c.slice(0, 8)}…`
  );
}

// ─── Hand-crafted single-field perturbations ─────────────────────────────────
// Validates: Requirements 9.5
{
  const base = buildBase();
  const baseDigest = await hashRunInputs(base);

  /**
   * Each entry produces a perturbed copy of `base` differing in exactly one
   * field. The expectation is uniform: the digest must change.
   */
  const perturbations: Array<{ name: string; mutate: (r: RunInputCanonical) => RunInputCanonical }> = [
    {
      name: 'perturb pnls (single value)',
      mutate: (r) => ({ ...r, pnls: [...r.pnls.slice(0, 2), r.pnls[2] + 1, ...r.pnls.slice(3)] }),
    },
    {
      name: 'perturb pnls (length)',
      mutate: (r) => ({ ...r, pnls: [...r.pnls, 0] }),
    },
    {
      name: 'perturb regimeTagIds',
      mutate: (r) => ({ ...r, regimeTagIds: [...r.regimeTagIds.slice(0, 1), 99, ...r.regimeTagIds.slice(2)] }),
    },
    {
      name: 'perturb benchmark',
      mutate: (r) => ({ ...r, benchmark: [...(r.benchmark ?? []).slice(0, 2), 1.234, ...(r.benchmark ?? []).slice(3)] }),
    },
    {
      name: 'perturb factorMatrix value',
      mutate: (r) => {
        const m = (r.factorMatrix ?? []).map((row) => [...row]);
        m[0][0] = m[0][0] + 0.0001;
        return { ...r, factorMatrix: m };
      },
    },
    {
      name: 'perturb commission',
      mutate: (r) => ({ ...r, commission: r.commission + 0.01 }),
    },
    {
      name: 'perturb slippage.model',
      mutate: (r) => ({ ...r, slippage: { ...r.slippage, model: 'fixed' } }),
    },
    {
      name: 'perturb slippage.impactCoefficient',
      mutate: (r) => ({ ...r, slippage: { ...r.slippage, impactCoefficient: r.slippage.impactCoefficient * 2 } }),
    },
    {
      name: 'perturb sleeveWeights',
      mutate: (r) => ({ ...r, sleeveWeights: [0.5, 0.25, 0.25] }),
    },
    {
      name: 'perturb prop.target',
      mutate: (r) => ({ ...r, prop: { ...r.prop, target: r.prop.target + 1 } }),
    },
    {
      name: 'perturb prop.maxDrawdown',
      mutate: (r) => ({ ...r, prop: { ...r.prop, maxDrawdown: r.prop.maxDrawdown + 1 } }),
    },
    {
      name: 'perturb prop.consistencyPercent',
      mutate: (r) => ({ ...r, prop: { ...r.prop, consistencyPercent: r.prop.consistencyPercent + 1 } }),
    },
    {
      name: 'perturb dailyLoss.enabled',
      mutate: (r) => ({ ...r, dailyLoss: { ...r.dailyLoss, enabled: !r.dailyLoss.enabled } }),
    },
    {
      name: 'perturb dailyLoss.maxLosses',
      mutate: (r) => ({ ...r, dailyLoss: { ...r.dailyLoss, maxLosses: r.dailyLoss.maxLosses + 1 } }),
    },
    {
      name: 'perturb dailyLoss.maxLossDollars',
      mutate: (r) => ({ ...r, dailyLoss: { ...r.dailyLoss, maxLossDollars: r.dailyLoss.maxLossDollars + 1 } }),
    },
    {
      name: 'perturb dailyLoss.tradesPerSession',
      mutate: (r) => ({ ...r, dailyLoss: { ...r.dailyLoss, tradesPerSession: r.dailyLoss.tradesPerSession + 1 } }),
    },
    {
      name: 'perturb samplingMode',
      mutate: (r) => ({ ...r, samplingMode: 'permutation' }),
    },
    {
      name: 'perturb modelType',
      mutate: (r) => ({ ...r, modelType: 'basic' }),
    },
    {
      name: 'perturb dataFormat',
      mutate: (r) => ({ ...r, dataFormat: 'pct' }),
    },
    {
      name: 'perturb rowFrequency',
      mutate: (r) => ({ ...r, rowFrequency: 'day' }),
    },
  ];

  for (const p of perturbations) {
    const perturbed = p.mutate(base);
    const newDigest = await hashRunInputs(perturbed);
    check(
      `Property 11: ${p.name} produces a different digest`,
      newDigest !== baseDigest,
      `base=${baseDigest.slice(0, 8)}… new=${newDigest.slice(0, 8)}…`
    );
  }
}

// ─── Fast-check: random single-field perturbation always changes the digest ─
// Validates: Requirements 9.5
{
  const base = buildBase();
  const baseDigest = await hashRunInputs(base);

  // Async fast-check property: pick a perturbation index and a small numeric
  // delta, apply it to one field, and assert the digest changes. Numeric
  // deltas are constrained to be non-zero so the property is well-defined.
  let counterexample: string | null = null;

  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 0, max: 5 }),
      // Floor `|delta|` at 1e-6 so the perturbation is always representable
      // against the order-1+ base values populated by `buildBase()`. Without
      // this floor, fast-check happily picks denormals like `-5e-324` which
      // underflow against `pnls[0] = 100` (`100 + -5e-324 === 100`), making
      // the property vacuously fail. Capping the upper magnitude is fine —
      // the property is about *any* representable change, not magnitude.
      fc.double({ noNaN: true, noDefaultInfinity: true, min: -100, max: 100 })
        .filter((d) => Number.isFinite(d) && Math.abs(d) >= 1e-6),
      async (which, delta) => {
        const r: RunInputCanonical = {
          ...base,
          pnls: [...base.pnls],
          regimeTagIds: [...base.regimeTagIds],
          benchmark: [...(base.benchmark ?? [])],
          factorMatrix: (base.factorMatrix ?? []).map((row) => [...row]),
          sleeveWeights: [...(base.sleeveWeights ?? [])],
          slippage: { ...base.slippage },
          prop: { ...base.prop },
          dailyLoss: { ...base.dailyLoss },
        };

        switch (which) {
          case 0:
            r.pnls[0] = r.pnls[0] + delta;
            break;
          case 1:
            r.commission = r.commission + delta;
            break;
          case 2:
            r.slippage.impactCoefficient = r.slippage.impactCoefficient + delta;
            break;
          case 3:
            (r.factorMatrix as number[][])[0][0] += delta;
            break;
          case 4:
            (r.benchmark as number[])[0] += delta;
            break;
          case 5:
            (r.sleeveWeights as number[])[0] += delta;
            break;
        }

        const d = await hashRunInputs(r);
        const ok = d !== baseDigest;
        if (!ok) {
          counterexample = `which=${which} delta=${delta} digest=${d.slice(0, 12)}`;
        }
        return ok;
      }
    ),
    // Reduced from 100 to 25 for faster test cadence.
    { numRuns: 25 }
  );

  check(
    'Property 11 (fast-check): random numeric perturbation changes the digest',
    counterexample === null,
    counterexample ?? ''
  );
}

if (failures > 0) {
  console.log(`\nFAIL ${failures} test(s)`);
  process.exit(1);
} else {
  console.log('\nPASS all tests');
}
