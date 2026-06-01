/**
 * Property test for `selectActiveHeroTier` in `../components/heroLadder`.
 *
 * Feature: webgl-hero, Property 7: Hero-tier selection matches the documented decision table
 *
 * For any combination of (mode, hasWebGL, theme, splineUrl):
 *   - totality:     the result is a valid HeroTier ('webgl'|'video'|'brand'|'spline').
 *   - determinism:  the same input yields the same tier on repeated calls.
 *   - decision table:
 *       mode='webgl' AND hasWebGL            -> 'webgl'
 *       mode='webgl' AND NOT hasWebGL        -> 'video' if dark else 'brand'
 *       otherwise (mode unset/unrecognised)  -> 'spline' if splineUrl is non-blank
 *                                               else ('video' if dark else 'brand')
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 *
 * Run with: npx tsx src/__tests__/property_heroLadder.test.ts
 *
 * Prints PASS / FAIL per check and exits non-zero on any failure.
 */

import fc from 'fast-check';
import {
  selectActiveHeroTier,
  type HeroTier,
  type SelectActiveHeroTierInput,
} from '../components/heroLadder';

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

const VALID_TIERS: ReadonlySet<HeroTier> = new Set<HeroTier>([
  'webgl',
  'video',
  'brand',
  'spline',
]);

/** The theme-appropriate next tier when the WebGL tier cannot render. */
function themeFallback(theme: 'light' | 'dark'): HeroTier {
  return theme === 'dark' ? 'video' : 'brand';
}

/**
 * Independent reference implementation of the documented precedence table.
 * Note: a blank/whitespace-only splineUrl counts as "unset" (uses `.trim()`),
 * matching the documented "Spline when SPLINE_SCENE_URL is set" behaviour.
 */
function expectedTier(input: SelectActiveHeroTierInput): HeroTier {
  if (input.mode === 'webgl') {
    return input.hasWebGL ? 'webgl' : themeFallback(input.theme);
  }
  if (input.splineUrl.trim() !== '') {
    return 'spline';
  }
  return themeFallback(input.theme);
}

console.log('\n[property_heroLadder] selectActiveHeroTier decision table');

// ─── Generators ─────────────────────────────────────────────────────────────
// mode: 'webgl', other recognised-looking strings, arbitrary strings, undefined.
const modeArb = fc.oneof(
  fc.constant<'webgl'>('webgl'),
  fc.constantFrom('video', 'brand', 'spline', 'WEBGL', '3d', '', 'auto'),
  fc.string(),
  fc.constant(undefined),
);

const themeArb = fc.constantFrom<'light' | 'dark'>('light', 'dark');

const hasWebGLArb = fc.boolean();

// splineUrl: blank, whitespace-only, and non-blank strings (incl. URL-like).
const splineUrlArb = fc.oneof(
  fc.constant(''),
  fc.constantFrom(' ', '  ', '\t', '\n', ' \t \n '),
  fc.constantFrom(
    'https://prod.spline.design/scene',
    'scene.splinecode',
    'x',
  ),
  fc.string(),
);

const inputArb: fc.Arbitrary<SelectActiveHeroTierInput> = fc.record({
  mode: modeArb,
  hasWebGL: hasWebGLArb,
  theme: themeArb,
  splineUrl: splineUrlArb,
});

// ─── Property 7 ───────────────────────────────────────────────────────────────
// Validates: Requirements 3.1, 3.2, 3.3, 3.4
{
  let lastDetail = '';
  let propertyHeld = true;

  try {
    fc.assert(
      fc.property(inputArb, (input) => {
        const tier = selectActiveHeroTier(input);

        // Totality: returns a valid HeroTier.
        if (!VALID_TIERS.has(tier)) {
          lastDetail = `invalid tier=${JSON.stringify(tier)} for input=${JSON.stringify(input)}`;
          return false;
        }

        // Determinism: same input -> same tier on a repeated call.
        const again = selectActiveHeroTier(input);
        if (again !== tier) {
          lastDetail = `non-deterministic: ${tier} !== ${again} for input=${JSON.stringify(input)}`;
          return false;
        }

        // Decision table: matches the independent reference.
        const want = expectedTier(input);
        if (tier !== want) {
          lastDetail = `expected=${want} actual=${tier} for input=${JSON.stringify(input)}`;
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
    'hero-tier selection matches the documented decision table (totality + determinism + table)',
    propertyHeld,
    propertyHeld ? '' : lastDetail,
  );
}

// ─── Sanity examples ──────────────────────────────────────────────────────────
// Fixed cases pinning each branch of the table for obvious regressions.
{
  check(
    "mode='webgl' + hasWebGL -> 'webgl'",
    selectActiveHeroTier({ mode: 'webgl', hasWebGL: true, theme: 'dark', splineUrl: '' }) === 'webgl',
  );
  check(
    "mode='webgl' + no WebGL + dark -> 'video'",
    selectActiveHeroTier({ mode: 'webgl', hasWebGL: false, theme: 'dark', splineUrl: '' }) === 'video',
  );
  check(
    "mode='webgl' + no WebGL + light -> 'brand'",
    selectActiveHeroTier({ mode: 'webgl', hasWebGL: false, theme: 'light', splineUrl: '' }) === 'brand',
  );
  check(
    "mode unset + splineUrl set -> 'spline'",
    selectActiveHeroTier({ mode: undefined, hasWebGL: true, theme: 'dark', splineUrl: 'scene.splinecode' }) === 'spline',
  );
  check(
    "mode unrecognised + whitespace splineUrl + dark -> 'video'",
    selectActiveHeroTier({ mode: 'auto', hasWebGL: true, theme: 'dark', splineUrl: '   ' }) === 'video',
  );
  check(
    "mode unrecognised + blank splineUrl + light -> 'brand'",
    selectActiveHeroTier({ mode: 'auto', hasWebGL: false, theme: 'light', splineUrl: '' }) === 'brand',
  );
}

if (failures > 0) {
  console.log(`\n[property_heroLadder] ${failures} check(s) failed`);
  process.exit(1);
}

console.log('\n[property_heroLadder] all checks passed');
