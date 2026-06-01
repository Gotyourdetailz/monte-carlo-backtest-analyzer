/**
 * Property tests for the pure WebGL hero helpers in `../components/webglHeroHelpers`.
 *
 * Feature: webgl-hero, Property 6: Theme-token fallback resolution
 * Feature: webgl-hero, Property 8: Rendered path count is bounded
 * Feature: webgl-hero, Property 9: Device pixel ratio is clamped
 * Feature: webgl-hero, Property 10: Animation runs only when visible, on-screen, and motion-allowed
 *
 * Validates: Requirements 2.2, 7.1, 8.1, 8.3, 10.1, 10.2, 10.3
 *
 * Run with: npx tsx src/__tests__/property_webglHeroHelpers.test.ts
 *
 * Prints PASS / FAIL per check and exits non-zero on any failure.
 */

import fc from 'fast-check';
import {
  resolveTokenValue,
  resolvePathCount,
  clampDpr,
  shouldAnimate,
  MAX_PATHS,
  SMALL_SCREEN_THRESHOLD,
  SMALL_SCREEN_CAP,
  MAX_DPR,
} from '../components/webglHeroHelpers';

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

console.log('\n[property_webglHeroHelpers] pure WebGL hero helpers');

// ─── Shared generators ────────────────────────────────────────────────────────
// Hostile/edge doubles: NaN, ±Infinity, signed zero, boundaries, and huge magnitudes.
const edgeNumberArb = fc.constantFrom(
  NaN,
  Infinity,
  -Infinity,
  0,
  -0,
  1,
  -1,
  0.5,
  2,
  3,
  SMALL_SCREEN_THRESHOLD - 1,
  SMALL_SCREEN_THRESHOLD,
  SMALL_SCREEN_THRESHOLD + 1,
  1920,
  1e9,
  -1e9,
  Number.MAX_VALUE,
  -Number.MAX_VALUE,
  Number.MIN_VALUE,
);

// Any width: mix of edge doubles, arbitrary doubles (incl. NaN/±Infinity from
// fast-check), and a broad finite integer range.
const widthArb = fc.oneof(
  edgeNumberArb,
  fc.double(),
  fc.integer({ min: -100_000, max: 100_000 }),
);

// Any raw device pixel ratio: edge doubles plus dpr-typical values.
const dprArb = fc.oneof(
  edgeNumberArb,
  fc.constantFrom(1.25, 1.5, 1.75, 2.25, 2.5, 100, 0.25),
  fc.double(),
);

// ─── Property 6 ───────────────────────────────────────────────────────────────
// Feature: webgl-hero, Property 6: Theme-token fallback resolution
// resolveTokenValue returns `raw` when it is a present, non-blank string;
// otherwise it returns the documented `fallback`.
// Validates: Requirements 2.2
{
  let lastDetail = '';
  let propertyHeld = true;

  // raw: present non-blank strings, blank/whitespace strings, plus null/undefined.
  const rawArb = fc.oneof(
    fc.string(),
    fc.constantFrom('', ' ', '  ', '\t', '\n', ' \t \n ', '#58a6ff', 'rgb(1,2,3)'),
    fc.constant(null),
    fc.constant(undefined),
  ) as fc.Arbitrary<string | null | undefined>;

  // fallback: a non-blank documented hex (mirrors the accent fallbacks).
  const fallbackArb = fc.constantFrom('#58a6ff', '#d2a8ff', '#e879f9');

  try {
    fc.assert(
      fc.property(rawArb, fallbackArb, (raw, fallback) => {
        const result = resolveTokenValue(raw, fallback);

        const rawIsPresentNonBlank =
          typeof raw === 'string' && raw.trim() !== '';
        const expected = rawIsPresentNonBlank ? (raw as string) : fallback;

        if (result !== expected) {
          lastDetail =
            `raw=${JSON.stringify(raw)} fallback=${JSON.stringify(fallback)} ` +
            `expected=${JSON.stringify(expected)} actual=${JSON.stringify(result)}`;
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
    'resolveTokenValue returns raw when present/non-blank, else the fallback',
    propertyHeld,
    propertyHeld ? '' : lastDetail,
  );
}

// ─── Property 8 ───────────────────────────────────────────────────────────────
// Feature: webgl-hero, Property 8: Rendered path count is bounded
// For any width (incl. zero, negative, NaN, ±Infinity, huge), resolvePathCount
// returns an integer in [1, MAX_PATHS]; and for any width below
// SMALL_SCREEN_THRESHOLD the result is additionally <= SMALL_SCREEN_CAP.
// Validates: Requirements 10.1, 10.2
{
  let lastDetail = '';
  let propertyHeld = true;

  try {
    fc.assert(
      fc.property(widthArb, (width) => {
        const count = resolvePathCount(width);

        if (!Number.isInteger(count)) {
          lastDetail = `width=${width} -> non-integer count=${count}`;
          return false;
        }
        if (count < 1 || count > MAX_PATHS) {
          lastDetail = `width=${width} -> count=${count} out of [1, ${MAX_PATHS}]`;
          return false;
        }
        // JS comparison: NaN/±Infinity are excluded naturally from this branch.
        if (width < SMALL_SCREEN_THRESHOLD && count > SMALL_SCREEN_CAP) {
          lastDetail =
            `small screen width=${width} -> count=${count} exceeds SMALL_SCREEN_CAP=${SMALL_SCREEN_CAP}`;
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
    'resolvePathCount is an integer in [1, MAX_PATHS], and <= SMALL_SCREEN_CAP on small screens',
    propertyHeld,
    propertyHeld ? '' : lastDetail,
  );
}

// ─── Property 9 ───────────────────────────────────────────────────────────────
// Feature: webgl-hero, Property 9: Device pixel ratio is clamped
// For any raw dpr (incl. NaN, 0, negatives, large), clampDpr returns a finite
// number in [1, MAX_DPR].
// Validates: Requirements 10.3
{
  let lastDetail = '';
  let propertyHeld = true;

  try {
    fc.assert(
      fc.property(dprArb, (rawDpr) => {
        const dpr = clampDpr(rawDpr);

        if (!Number.isFinite(dpr)) {
          lastDetail = `rawDpr=${rawDpr} -> non-finite dpr=${dpr}`;
          return false;
        }
        if (dpr < 1 || dpr > MAX_DPR) {
          lastDetail = `rawDpr=${rawDpr} -> dpr=${dpr} out of [1, ${MAX_DPR}]`;
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
    'clampDpr returns a finite value in [1, MAX_DPR] for any raw dpr',
    propertyHeld,
    propertyHeld ? '' : lastDetail,
  );
}

// ─── Property 10 ──────────────────────────────────────────────────────────────
// Feature: webgl-hero, Property 10: Animation runs only when visible, on-screen, and motion-allowed
// For all boolean triples, shouldAnimate === (!reducedMotion && !documentHidden
// && sectionIntersecting).
// Validates: Requirements 7.1, 8.1, 8.3
{
  let lastDetail = '';
  let propertyHeld = true;

  try {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (reducedMotion, documentHidden, sectionIntersecting) => {
          const result = shouldAnimate({
            reducedMotion,
            documentHidden,
            sectionIntersecting,
          });
          const expected =
            !reducedMotion && !documentHidden && sectionIntersecting;

          if (result !== expected) {
            lastDetail =
              `reducedMotion=${reducedMotion} documentHidden=${documentHidden} ` +
              `sectionIntersecting=${sectionIntersecting} -> expected=${expected} actual=${result}`;
            return false;
          }
          return true;
        },
      ),
      { numRuns: 25 },
    );
  } catch (e) {
    propertyHeld = false;
    if (!lastDetail) lastDetail = (e as Error).message;
  }

  check(
    'shouldAnimate is true iff motion allowed, document visible, and section on-screen',
    propertyHeld,
    propertyHeld ? '' : lastDetail,
  );
}

// ─── Sanity examples ──────────────────────────────────────────────────────────
// Fixed cases pinning each helper's documented behaviour for obvious regressions.
{
  // P6 — present/non-blank vs blank/missing.
  check(
    "resolveTokenValue('#abc', fb) returns the present value",
    resolveTokenValue('#abc', '#58a6ff') === '#abc',
  );
  check(
    "resolveTokenValue('  ', fb) falls back (whitespace is blank)",
    resolveTokenValue('  ', '#58a6ff') === '#58a6ff',
  );
  check(
    'resolveTokenValue(null, fb) falls back',
    resolveTokenValue(null, '#d2a8ff') === '#d2a8ff',
  );
  check(
    'resolveTokenValue(undefined, fb) falls back',
    resolveTokenValue(undefined, '#e879f9') === '#e879f9',
  );

  // P8 — small screen capped, large screen at MAX_PATHS, hostile inputs bounded.
  check(
    'resolvePathCount(320) <= SMALL_SCREEN_CAP (small screen)',
    resolvePathCount(320) <= SMALL_SCREEN_CAP && resolvePathCount(320) >= 1,
    `count=${resolvePathCount(320)}`,
  );
  check(
    'resolvePathCount(1920) === MAX_PATHS (full screen)',
    resolvePathCount(1920) === MAX_PATHS,
    `count=${resolvePathCount(1920)}`,
  );
  check(
    'resolvePathCount(NaN) is the small-screen cap',
    resolvePathCount(NaN) === SMALL_SCREEN_CAP,
    `count=${resolvePathCount(NaN)}`,
  );
  check(
    'resolvePathCount(-5) is bounded to [1, SMALL_SCREEN_CAP]',
    resolvePathCount(-5) >= 1 && resolvePathCount(-5) <= SMALL_SCREEN_CAP,
    `count=${resolvePathCount(-5)}`,
  );
  check(
    'resolvePathCount(1e9) === MAX_PATHS',
    resolvePathCount(1e9) === MAX_PATHS,
    `count=${resolvePathCount(1e9)}`,
  );

  // P9 — clamp boundaries and hostile inputs.
  check('clampDpr(NaN) === 1', clampDpr(NaN) === 1);
  check('clampDpr(0) === 1', clampDpr(0) === 1);
  check('clampDpr(-3) === 1', clampDpr(-3) === 1);
  check('clampDpr(1.5) === 1.5', clampDpr(1.5) === 1.5);
  check(`clampDpr(5) === MAX_DPR (${MAX_DPR})`, clampDpr(5) === MAX_DPR);
  check('clampDpr(Infinity) === 1', clampDpr(Infinity) === 1);

  // P10 — only the all-favourable triple animates.
  check(
    'shouldAnimate animates only when motion allowed + visible + on-screen',
    shouldAnimate({ reducedMotion: false, documentHidden: false, sectionIntersecting: true }) === true &&
      shouldAnimate({ reducedMotion: true, documentHidden: false, sectionIntersecting: true }) === false &&
      shouldAnimate({ reducedMotion: false, documentHidden: true, sectionIntersecting: true }) === false &&
      shouldAnimate({ reducedMotion: false, documentHidden: false, sectionIntersecting: false }) === false,
  );
}

if (failures > 0) {
  console.log(`\n[property_webglHeroHelpers] ${failures} check(s) failed`);
  process.exit(1);
}

console.log('\n[property_webglHeroHelpers] all checks passed');
