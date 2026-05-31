/**
 * Property test: theme token registries are structurally parallel and meet
 * WCAG contrast floors in BOTH modes.
 *
 * Properties:
 *   1. `darkTokens` and `lightTokens` expose an identical set of keys.
 *   2. In each registry, text-primary on bg-primary has contrast >= 7.0 (AAA).
 *   3. In each registry, text-secondary on bg-primary has contrast >= 4.5 (AA).
 *
 * Run with: npx tsx src/__tests__/property_theme_parity.test.ts
 *
 * Prints PASS / FAIL per check and exits non-zero on any failure.
 */

import { darkTokens, lightTokens, contrastRatio } from '../theme/tokens';

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

console.log('\n[property_theme_parity] checking token registries');

// ── Property 1: registry parity ────────────────────────────────────────────
const darkKeys = Object.keys(darkTokens).sort();
const lightKeys = Object.keys(lightTokens).sort();

check(
  'darkTokens and lightTokens have identical keys',
  JSON.stringify(darkKeys) === JSON.stringify(lightKeys),
  `dark=${darkKeys.length} light=${lightKeys.length}`,
);

// ── Properties 2 & 3: contrast floors in both registries ────────────────────
const registries: ReadonlyArray<
  readonly [string, Readonly<Record<string, string>>]
> = [
  ['dark', darkTokens],
  ['light', lightTokens],
];

for (const [name, tokens] of registries) {
  const primaryOnBg = contrastRatio(
    tokens['--text-primary'],
    tokens['--bg-primary'],
  );
  check(
    `${name}: contrast(text-primary, bg-primary) >= 7.0`,
    primaryOnBg >= 7.0,
    primaryOnBg.toFixed(3),
  );

  const secondaryOnBg = contrastRatio(
    tokens['--text-secondary'],
    tokens['--bg-primary'],
  );
  check(
    `${name}: contrast(text-secondary, bg-primary) >= 4.5`,
    secondaryOnBg >= 4.5,
    secondaryOnBg.toFixed(3),
  );
}

if (failures > 0) {
  console.log(`\n[property_theme_parity] ${failures} check(s) failed`);
  process.exit(1);
}

console.log('\n[property_theme_parity] all checks passed');
