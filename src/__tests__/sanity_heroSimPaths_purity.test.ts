/**
 * Sanity test: Hero_Sim_Paths purity + Property_Test presence (webgl-hero
 * task 8.4).
 *
 * Guards three contract guarantees of the pure seeded-PRNG path module that the
 * type-checker alone cannot enforce:
 *
 *   1. `src/heroSimPaths.ts` exists at its dedicated single-concern path
 *      (Requirement 13.5).
 *   2. Its source references no React import and no DOM API (`document` /
 *      `window`), so it stays a pure, React/DOM-free leaf module per the
 *      one-concern-per-file convention (Requirement 13.4).
 *   3. `src/__tests__/property_heroSimPaths.test.ts` exists AND is discoverable
 *      by the `run_all.test.ts` aggregator — i.e. it lives in `src/__tests__/`
 *      and matches the aggregator's `*.test.ts` discovery predicate
 *      (Requirements 14.5).
 *
 * Run with: npx tsx src/__tests__/sanity_heroSimPaths_purity.test.ts
 *
 * Prints PASS / FAIL per check and exits non-zero on any failure. Auto-joins
 * the suite via `run_all.test.ts`. No Jest/Vitest (per tech.md).
 *
 * Validates: Requirements 13.4, 13.5, 14.5
 *
 * ── Purity-scan approach ─────────────────────────────────────────────────────
 * The module's own JSDoc legitimately mentions the words "react",
 * "document" and "window" (it documents that it deliberately uses none of
 * them). A naive substring scan would therefore false-positive on the prose.
 * To stay robust we BOTH:
 *   (a) strip block + line comments before scanning, so documentation prose is
 *       never considered; and
 *   (b) scan the comment-free source only for *actual code patterns* — module
 *       specifiers like `from 'react'` / `import 'react'` / `require('react')`,
 *       and `document` / `window` used as bare identifiers (`\bdocument\b` /
 *       `\bwindow\b`).
 * heroSimPaths.ts contains no string/regex literals carrying comment
 * delimiters, so the lexer-free comment strip is safe here.
 */

import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// src/__tests__/ -> repo root.
const TESTS_DIR = __dirname;
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const HERO_SIM_PATHS = path.resolve(REPO_ROOT, 'src', 'heroSimPaths.ts');
const PROPERTY_TEST_BASENAME = 'property_heroSimPaths.test.ts';
const PROPERTY_TEST_PATH = path.resolve(TESTS_DIR, PROPERTY_TEST_BASENAME);

// The aggregator (`run_all.test.ts`) excludes itself from discovery; mirror that
// so our discoverability predicate matches its behaviour exactly.
const AGGREGATOR_BASENAME = 'run_all.test.ts';

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

/** True iff `p` exists on disk as a regular file. */
function fileExists(p: string): boolean {
  try {
    return readFileSync(p).length >= 0;
  } catch {
    return false;
  }
}

/**
 * Remove block comments (`/* ... *​/`, incl. JSDoc) and line comments (`// ...`)
 * from TypeScript source. Deliberately lexer-free: heroSimPaths.ts has no
 * string/regex literals containing comment delimiters, so naive removal is safe
 * and keeps the purity scan from false-positiving on documentation prose.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
}

/**
 * Mirror of the aggregator's discovery predicate in `run_all.test.ts`
 * (`discoverTests`): a file is discovered when it ends with `.test.ts` and is
 * not the aggregator itself. Keeping this in lock-step makes the
 * "discoverable by the aggregator" assertion meaningful rather than nominal.
 */
function isDiscoverableByAggregator(basename: string): boolean {
  return basename.endsWith('.test.ts') && basename !== AGGREGATOR_BASENAME;
}

console.log('\n[sanity_heroSimPaths_purity] purity + property-presence checks');
console.log(`  module: ${HERO_SIM_PATHS}`);

// ─── 1. heroSimPaths.ts exists at its dedicated path (Req 13.5) ──────────────
const heroSimExists = fileExists(HERO_SIM_PATHS);
check('src/heroSimPaths.ts exists at its dedicated single-concern path', heroSimExists);

// ─── 2. Purity scan: no React import, no document/window reference (Req 13.4) ─
if (heroSimExists) {
  const rawSource = readFileSync(HERO_SIM_PATHS, 'utf8');
  const code = stripComments(rawSource);

  // 2a. No React import (module specifier `react` or any `react/*` subpath,
  //     via `from`, bare `import`, or `require()`).
  const reactImportPatterns: RegExp[] = [
    /\bfrom\s+['"]react(?:\/[^'"]*|-dom(?:\/[^'"]*)?)?['"]/, // import x from 'react' | 'react-dom' | 'react/jsx-runtime'
    /\bimport\s+['"]react(?:\/[^'"]*|-dom(?:\/[^'"]*)?)?['"]/, // import 'react'
    /\brequire\(\s*['"]react(?:\/[^'"]*|-dom(?:\/[^'"]*)?)?['"]\s*\)/, // require('react')
  ];
  const reactMatch = reactImportPatterns
    .map((re) => code.match(re))
    .find((m) => m !== null);
  check(
    'heroSimPaths.ts code imports no React module',
    reactMatch == null,
    reactMatch ? `found: ${reactMatch[0].trim()}` : '',
  );

  // 2b. No DOM globals used as identifiers (`document` / `window`).
  const documentMatch = code.match(/\bdocument\b/);
  check(
    'heroSimPaths.ts code references no `document` DOM global',
    documentMatch == null,
    documentMatch ? 'found `document` identifier in code' : '',
  );

  const windowMatch = code.match(/\bwindow\b/);
  check(
    'heroSimPaths.ts code references no `window` DOM global',
    windowMatch == null,
    windowMatch ? 'found `window` identifier in code' : '',
  );
} else {
  // Cannot scan a file that does not exist — surface the dependent checks as
  // failures rather than silently skipping them.
  check('heroSimPaths.ts code imports no React module', false, 'module missing');
  check('heroSimPaths.ts code references no `document` DOM global', false, 'module missing');
  check('heroSimPaths.ts code references no `window` DOM global', false, 'module missing');
}

// ─── 3. property_heroSimPaths.test.ts exists and is aggregator-discoverable ──
//        (Req 14.5)
const propertyTestExists = fileExists(PROPERTY_TEST_PATH);
check(
  `src/__tests__/${PROPERTY_TEST_BASENAME} exists`,
  propertyTestExists,
);

// It must match the aggregator's discovery predicate...
check(
  `${PROPERTY_TEST_BASENAME} matches the aggregator's *.test.ts discovery predicate`,
  isDiscoverableByAggregator(PROPERTY_TEST_BASENAME),
);

// ...AND it must be a `property_*.test.ts` fast-check file (Req 14.5).
check(
  `${PROPERTY_TEST_BASENAME} follows the property_*.test.ts naming convention`,
  /^property_.+\.test\.ts$/.test(PROPERTY_TEST_BASENAME),
);

// ...AND actually be present in the directory the aggregator scans, so a real
// `run_all.test.ts` run would pick it up.
{
  const discovered = readdirSync(TESTS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter(isDiscoverableByAggregator);
  check(
    `${PROPERTY_TEST_BASENAME} is discovered when scanning src/__tests__/ like the aggregator`,
    discovered.includes(PROPERTY_TEST_BASENAME),
    `${discovered.length} test file(s) discovered`,
  );
}

// ─── Summary ─────────────────────────────────────────────────────────────────
if (failures > 0) {
  console.log(`\n[sanity_heroSimPaths_purity] ${failures} check(s) failed`);
  process.exit(1);
}

console.log('\n[sanity_heroSimPaths_purity] all checks passed');
