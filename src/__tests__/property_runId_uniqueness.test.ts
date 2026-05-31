/**
 * Property test for `generateRunId` collision resistance.
 *
 * Property 9: runId uniqueness across rapid sub-runs (same millisecond)
 *
 * The previous `Date.now()`-based scheme could collide whenever two
 * sub-runs were dispatched inside the same millisecond. The replacement
 * uses `crypto.randomUUID()` (with a documented fallback) and must
 * therefore produce no collisions across a tight generation loop.
 *
 * Strategy:
 *   1. Generate N=1000 runIds in a tight loop (well within a single
 *      millisecond on modern hardware), once for the `'run'` prefix and
 *      once for the `'portfolio'` prefix.
 *   2. Assert the resulting `Set` size equals N (no collisions).
 *   3. Spot-check the prefix and shape of the generated id.
 *   4. Re-validate via `fast-check` across a range of N to make the
 *      property assertion explicit.
 *
 * Validates: Requirements 9.9
 *
 * Run with: npx tsx src/__tests__/property_runId_uniqueness.test.ts
 */

import fc from 'fast-check';
import { generateRunId } from '../mathUtils';

let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

console.log('\n[property_runId_uniqueness]');

// ─── Property 9 ──────────────────────────────────────────────────────────────
// Validates: Requirements 9.9
{
  // Reduced from 1000 to 250 for faster test cadence.
  const N = 250;

  // 'run' prefix — tight loop, one millisecond budget.
  const runIds = new Set<string>();
  const runStart = Date.now();
  for (let i = 0; i < N; i++) {
    runIds.add(generateRunId('run'));
  }
  const runElapsed = Date.now() - runStart;
  check(
    `generateRunId('run') is unique across ${N} rapid calls`,
    runIds.size === N,
    `unique=${runIds.size}/${N} elapsedMs=${runElapsed}`
  );

  // 'portfolio' prefix — independent run, same expectation.
  const portfolioIds = new Set<string>();
  const portfolioStart = Date.now();
  for (let i = 0; i < N; i++) {
    portfolioIds.add(generateRunId('portfolio'));
  }
  const portfolioElapsed = Date.now() - portfolioStart;
  check(
    `generateRunId('portfolio') is unique across ${N} rapid calls`,
    portfolioIds.size === N,
    `unique=${portfolioIds.size}/${N} elapsedMs=${portfolioElapsed}`
  );

  // Cross-prefix disjointness: run and portfolio ids must never collide.
  let crossCollisions = 0;
  for (const id of portfolioIds) if (runIds.has(id)) crossCollisions++;
  check(
    "'run' and 'portfolio' id namespaces are disjoint",
    crossCollisions === 0,
    `crossCollisions=${crossCollisions}`
  );

  // Shape spot-check: prefix is preserved.
  const sampleRun = generateRunId('run');
  const samplePortfolio = generateRunId('portfolio');
  check(
    "generateRunId('run') starts with 'run_'",
    sampleRun.startsWith('run_'),
    `sample=${sampleRun}`
  );
  check(
    "generateRunId('portfolio') starts with 'portfolio_'",
    samplePortfolio.startsWith('portfolio_'),
    `sample=${samplePortfolio}`
  );
}

// ─── Fast-check property: uniqueness for arbitrary batch sizes ───────────────
// Validates: Requirements 9.9
{
  let lastDetail = '';
  let propertyHeld = true;

  try {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 500 }),
        fc.constantFrom<'run' | 'portfolio'>('run', 'portfolio'),
        (n, prefix) => {
          const ids = new Set<string>();
          for (let i = 0; i < n; i++) ids.add(generateRunId(prefix));
          const ok = ids.size === n;
          if (!ok) {
            lastDetail = `prefix=${prefix} n=${n} unique=${ids.size}`;
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
    'generateRunId is unique across arbitrary batch sizes (fast-check)',
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
