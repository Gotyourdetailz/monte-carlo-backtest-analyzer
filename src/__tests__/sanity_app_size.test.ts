/**
 * Sanity test: src/App.tsx has been decomposed per task 5.13.
 *
 *   1. Total line count is under 600.
 *   2. No INLINE `parseFinancialNumber` definition remains (the named import
 *      from `./csvIngest` and pass-through references are allowed).
 *   3. No `Papa.parse(` call sites remain (CSV parsing now lives in
 *      `csvIngest.ts` / the parse worker).
 *   4. No `.postMessage(` call sites remain (worker dispatch now lives in
 *      `useSimulationRunner`; any `*.postMessage(` from `App.tsx` would be
 *      a regression).
 *   5. No INLINE `MetricCard` component definition remains (it's imported
 *      from `./components/MetricCard`).
 *   6. No `Papa.unparse` call sites remain (CSV download builder lives in
 *      `csvExport.ts`).
 *
 * Run with: npx tsx src/__tests__/sanity_app_size.test.ts
 *
 * Prints PASS / FAIL per check and exits non-zero on any failure.
 *
 * Validates: Requirements 10.7
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const appPath = resolve(repoRoot, 'src', 'App.tsx');

const MAX_LINES = 600;

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

console.log(`\n[sanity_app_size] reading ${appPath}`);

const source = readFileSync(appPath, 'utf8');
const lines = source.split('\n');

// 1. Line count.
check(
  `App.tsx line count is under ${MAX_LINES}`,
  lines.length < MAX_LINES,
  `actual=${lines.length}`,
);

// 2. No INLINE parseFinancialNumber definition. Allowed forms:
//    - `import { parseFinancialNumber, ... } from './csvIngest'`
//    - bare references like `parseFinancialNumber,` passed as a callback
// Disallowed forms (definitions):
//    - `function parseFinancialNumber(`
//    - `const parseFinancialNumber =`
//    - `let parseFinancialNumber =`
//    - `var parseFinancialNumber =`
const inlineParseDefRegex =
  /(?:function\s+parseFinancialNumber\s*\(|(?:const|let|var)\s+parseFinancialNumber\s*[:=])/;

const inlineParseDefMatch = source.match(inlineParseDefRegex);
check(
  'App.tsx contains no INLINE parseFinancialNumber definition',
  inlineParseDefMatch == null,
  inlineParseDefMatch ? `matched: ${inlineParseDefMatch[0]}` : '',
);

// 3. No Papa.parse( call sites.
const papaParseCount = (source.match(/Papa\.parse\(/g) ?? []).length;
check(
  'App.tsx contains no Papa.parse( call sites',
  papaParseCount === 0,
  `count=${papaParseCount}`,
);

// 4. No `.postMessage(` call sites. We strip block + line comments first so
//    prose like "see postMessage(...)" in JSDoc does not false-positive.
const stripped = source
  .replace(/\/\*[\s\S]*?\*\//g, '')         // block comments
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');    // line comments (preserve "://" in URLs)
const postMessageCount = (stripped.match(/\.postMessage\(/g) ?? []).length;
check(
  'App.tsx contains no .postMessage( call sites',
  postMessageCount === 0,
  `count=${postMessageCount}`,
);

// 5. No INLINE MetricCard definition. Allowed forms:
//    - `import { MetricCard } from './components/MetricCard'`
//    - bare references
// Disallowed forms (definitions):
//    - `function MetricCard(`
//    - `const MetricCard = `
//    - `let MetricCard = `
//    - `var MetricCard = `
const inlineMetricCardRegex =
  /(?:function\s+MetricCard\s*\(|(?:const|let|var)\s+MetricCard\s*[:=])/;

const inlineMetricCardMatch = source.match(inlineMetricCardRegex);
check(
  'App.tsx contains no INLINE MetricCard definition',
  inlineMetricCardMatch == null,
  inlineMetricCardMatch ? `matched: ${inlineMetricCardMatch[0]}` : '',
);

// 6. No Papa.unparse( call sites.
const papaUnparseCount = (source.match(/Papa\.unparse\(/g) ?? []).length;
check(
  'App.tsx contains no Papa.unparse( call sites',
  papaUnparseCount === 0,
  `count=${papaUnparseCount}`,
);

if (failures > 0) {
  console.log(`\n[sanity_app_size] ${failures} check(s) failed`);
  process.exit(1);
}

console.log('\n[sanity_app_size] all checks passed');
