/**
 * Phase B / B7 — revamp smoke checks.
 *
 * Cheap structural guards over the token system, routing, font hosting, and
 * the no-`backdrop-filter` surface rule. Plain-tsx harness: prints ✅/❌ and
 * exits non-zero on any failure (aggregated by run_all.test.ts).
 */
import * as fs from 'fs';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, label: string): void {
  if (cond) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  ❌ ${label}`);
  }
}

function read(path: string): string {
  return fs.readFileSync(path, 'utf-8');
}

// ── Token system (B1) ────────────────────────────────────────────────
const themeCss = read('src/theme.css');
assert(/--accent-blue:\s*#46e6c8/i.test(themeCss), 'theme.css defines --accent-blue:#46e6c8 (ion mint)');
assert(/--accent-mint:\s*#46e6c8/i.test(themeCss), 'theme.css defines --accent-mint:#46e6c8');
assert(/\[data-theme="light"\]/.test(themeCss), 'theme.css registers a light-mode selector');
assert(/\[data-density="compact"\]/.test(themeCss), 'theme.css registers a compact-density selector');

const indexCss = read('src/index.css');
assert(/@import\s+['"]\.\/theme\.css['"]/.test(indexCss), "index.css imports './theme.css'");

// ── Routing (B4) ─────────────────────────────────────────────────────
const mainTsx = read('src/main.tsx');
assert(/path:\s*['"]\/['"]/.test(mainTsx), "main.tsx registers the '/' route");
assert(/path:\s*['"]\/app['"]/.test(mainTsx), "main.tsx registers the '/app' route");
assert(/RouterProvider/.test(mainTsx), 'main.tsx mounts a RouterProvider');
assert(/ThemeProvider/.test(mainTsx), 'main.tsx wraps the app in ThemeProvider');

// ── Self-hosted fonts (A3/B1), font-display handled by Fontsource ─────
assert(
  /@fontsource-variable\/inter/.test(mainTsx) &&
    /@fontsource-variable\/jetbrains-mono/.test(mainTsx) &&
    /@fontsource-variable\/manrope/.test(mainTsx),
  'main.tsx self-hosts all three fonts (Inter, JetBrains Mono, Manrope) via Fontsource',
);
assert(!/fonts\.googleapis\.com/.test(indexCss), 'index.css has no CSP-violating Google Fonts @import');

// Fluid Analytical cutover: the old "no backdrop-filter" rule (Req 20.1) is
// retired — the glass shell (`.glass-panel`) deliberately uses backdrop-filter.
// Guard the inverse instead: the glass primitive must exist in index.css.
assert(/backdrop-filter/.test(indexCss), 'index.css ships the glass shell (backdrop-filter present)');

// ── Structure rule: pure theme logic stays React-free ────────────────
for (const f of ['src/theme/tokens.ts', 'src/theme/themeMode.ts', 'src/theme/density.ts']) {
  const src = read(f);
  assert(!/from\s+['"]react['"]/.test(src), `pure theme module imports no React: ${f}`);
}

console.log(`\n[sanity_revamp_smoke] ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('Failed:');
  for (const f of failures) console.log(`  ❌ ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
