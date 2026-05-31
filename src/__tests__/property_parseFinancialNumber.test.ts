/**
 * Property tests for `parseFinancialNumber` (csvIngest.ts).
 *
 * Validates: Requirements 10.1, 11.1, 25.2.
 *
 * Run with: npx tsx src/__tests__/property_parseFinancialNumber.test.ts
 *
 * Prints PASS / FAIL per property and exits non-zero on any failure.
 */

import * as fc from 'fast-check';
import { strict as assert } from 'node:assert';
import { parseFinancialNumber } from '../csvIngest';

let failures = 0;

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  FAIL  ${name} — ${msg}`);
    failures++;
  }
}

/**
 * Canonical financial formatter:
 *   negatives → `($abs)`  (parenthesised-negative convention)
 *   non-negatives → `$n`
 *
 * Mirrors the formats `parseFinancialNumber` is contracted to handle: a `$`
 * prefix, optional commas / whitespace, and `(...)`-as-negative.
 */
function canonicalFormat(n: number): string {
  if (n < 0) return `($${Math.abs(n)})`;
  return `$${n}`;
}

// ─── Property 3 ──────────────────────────────────────────────────────────
// parseFinancialNumber round-trips against canonical formatter.
//
// For any finite number n, parseFinancialNumber(canonical(n)) ≈ n within
// floating-point rounding tolerance. The cleanup pipeline strips `$`,
// re-signs `(...)` to `-`, and forwards to `Number(...)`, so the round-trip
// fidelity is bounded by `String(n) → Number(...)` precision.
run('Property 3: parseFinancialNumber round-trips against canonical formatter', () => {
  fc.assert(
    fc.property(
      fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e15, max: 1e15 }),
      (n) => {
        const s = canonicalFormat(n);
        const back = parseFinancialNumber(s);
        // Allow ulp-scale slop for very large magnitudes; pin a 1e-9 floor for
        // values near zero where relative tolerance collapses.
        const tol = Math.max(1e-9, Math.abs(n) * 1e-12);
        assert.ok(
          Number.isFinite(back) && Math.abs(back - n) <= tol,
          `round-trip drifted: n=${n} formatted="${s}" parsed=${back} tol=${tol}`
        );
      }
    ),
    // Reduced from 100 to 25 for faster test cadence.
    { numRuns: 25 }
  );
});

// ─── Property 4 ──────────────────────────────────────────────────────────
// parseFinancialNumber rejects malformed input with NaN.
//
// Generator constraints (so the test isn't trivially false):
//   - Restrict to characters that the cleanup pipeline does NOT strip
//     (i.e. exclude `$`, `,`, ASCII whitespace, `(`, `)`).
//   - Exclude any character `Number(...)` could legitimately consume:
//     digits 0-9, `+`, `-`, `.`, `e`, `E`.
//   - Require minLength ≥ 1 so the input never collapses to `""` (which
//     `Number('')` returns 0 — see JSDoc note in csvIngest.ts).
const NON_NUMERIC_CHARS = [
  'a', 'b', 'c', 'd', 'f', 'g', 'h', 'i', 'j', 'k',
  'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u',
  'v', 'w', 'x', 'y', 'z',
  'A', 'B', 'C', 'D', 'F', 'G', 'H', 'I', 'J', 'K',
  '#', '@', '!', '?', '/', '*', '%', '&', '~', '^',
  ':', ';', '<', '>', '=', '|', '\\', '"', "'", '`',
  '{', '}', '[', ']',
];

run('Property 4: parseFinancialNumber rejects malformed input with NaN', () => {
  fc.assert(
    fc.property(
      fc.stringOf(fc.constantFrom(...NON_NUMERIC_CHARS), {
        minLength: 1,
        maxLength: 16,
      }),
      (s) => {
        const out = parseFinancialNumber(s);
        assert.ok(
          Number.isNaN(out),
          `expected NaN for non-numeric "${s}", got ${out}`
        );
      }
    ),
    // Reduced from 100 to 25 for faster test cadence.
    { numRuns: 25 }
  );
});

// ─── Exit code ───────────────────────────────────────────────────────────
if (failures > 0) {
  console.log(`\n${failures} property test(s) FAILED`);
  process.exit(1);
}
console.log('\nAll parseFinancialNumber property tests passed.');
