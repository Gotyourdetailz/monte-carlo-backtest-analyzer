/**
 * Sanity test: the GENERATED `src/theme.css` contains the expected accent
 * tokens and the light / compact selectors.
 *
 * This guards against the codegen output drifting from `tokens.ts` (e.g. the
 * file was never regenerated after a token change).
 *
 * Run with: npx tsx src/__tests__/sanity_theme_tokens.test.ts
 *
 * Prints PASS / FAIL per check and exits non-zero on any failure.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const themeCssPath = resolve(repoRoot, 'src', 'theme.css');

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

console.log(`\n[sanity_theme_tokens] reading ${themeCssPath}`);

const css = readFileSync(themeCssPath, 'utf8');

// Fluid Analytical cutover: the product accent is ion-mint; legacy key names
// are preserved but their values fold onto the mint family (no AI-blue/violet).
check(
  'theme.css defines --accent-blue: #46e6c8 (ion mint)',
  /--accent-blue:\s*#46e6c8/.test(css),
);

check(
  'theme.css defines --accent-magenta: #46e6c8 (remapped to mint)',
  /--accent-magenta:\s*#46e6c8/.test(css),
);

check(
  'theme.css defines --accent-mint: #46e6c8',
  /--accent-mint:\s*#46e6c8/.test(css),
);

check(
  'theme.css contains a [data-theme="light"] selector',
  css.includes('[data-theme="light"]'),
);

check(
  'theme.css contains a [data-density="compact"] selector',
  css.includes('[data-density="compact"]'),
);

if (failures > 0) {
  console.log(`\n[sanity_theme_tokens] ${failures} check(s) failed`);
  process.exit(1);
}

console.log('\n[sanity_theme_tokens] all checks passed');
