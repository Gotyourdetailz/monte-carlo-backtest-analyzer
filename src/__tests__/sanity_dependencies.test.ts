/**
 * Sanity test for dependency cleanup (task 2.4 / Requirements 3.1, 3.2, 11.5).
 *
 * Parses package.json and asserts:
 *   - `@google/genai`, `dotenv`, `express`, `jspdf` are absent from every
 *     dependency bucket (dependencies, devDependencies, peerDependencies,
 *     optionalDependencies).
 *   - `papaparse`, `@react-pdf/renderer`, `html2canvas` are present in
 *     `dependencies` and pinned to an EXACT version (no `^` or `~` prefix).
 *   - `three` and `@react-three/fiber` are present in `dependencies` (not
 *     `devDependencies`) and pinned to an exact `MAJOR.MINOR.PATCH` version
 *     with no range prefix (webgl-hero task 8.3 / Requirements 12.1).
 *   - `fast-check` is present in `devDependencies`.
 *
 * Run with: npx tsx src/__tests__/sanity_dependencies.test.ts
 *
 * Prints PASS / FAIL per assertion and exits non-zero on any failure.
 */

import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Walk up from src/__tests__/ to repo root.
const PACKAGE_JSON_PATH = path.resolve(__dirname, '..', '..', 'package.json');

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const ALL_BUCKETS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

const REMOVED_DEPS = ['@google/genai', 'dotenv', 'express', 'jspdf'] as const;
const PINNED_DEPS = ['papaparse', '@react-pdf/renderer', 'html2canvas'] as const;
// webgl-hero 3D runtime deps: must live in `dependencies` and be pinned to a
// strict MAJOR.MINOR.PATCH (no prerelease/build/range) per Requirements 12.1.
const PINNED_3D_DEPS = ['three', '@react-three/fiber'] as const;

let failures = 0;

function check(name: string, fn: () => void, detail = ''): void {
  try {
    fn();
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  FAIL  ${name} — ${msg}`);
    failures++;
  }
}

function isExactVersion(version: string): boolean {
  // Reject npm range prefixes: ^, ~, >, <, =, ||, x/X wildcards, *, blank.
  // Accept a plain semver `MAJOR.MINOR.PATCH` (with optional prerelease/build).
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version);
}

function isStrictVersion(version: string): boolean {
  // Strict `MAJOR.MINOR.PATCH` only — no range prefix (^/~/>/<), no wildcard
  // (*/x/X), and no prerelease/build suffix. Used for the pinned 3D deps.
  return /^\d+\.\d+\.\d+$/.test(version);
}

const raw = readFileSync(PACKAGE_JSON_PATH, 'utf-8');
const pkg: PackageManifest = JSON.parse(raw);

console.log('\n[sanity_dependencies]');
console.log(`  package.json: ${PACKAGE_JSON_PATH}`);

// ─── Removed dependencies must not appear in any bucket. ─────────────────────
for (const dep of REMOVED_DEPS) {
  for (const bucket of ALL_BUCKETS) {
    check(`${bucket}.${dep} is absent`, () => {
      const map = pkg[bucket];
      assert.ok(
        !map || !(dep in map),
        `${dep} unexpectedly present in ${bucket} (value: ${map?.[dep]})`,
      );
    });
  }
}

// ─── Pinned dependencies must be present in `dependencies` with exact versions.
for (const dep of PINNED_DEPS) {
  check(`dependencies.${dep} is present and pinned exactly`, () => {
    const deps = pkg.dependencies ?? {};
    assert.ok(dep in deps, `${dep} missing from dependencies`);
    const version = deps[dep];
    assert.ok(
      typeof version === 'string' && version.length > 0,
      `${dep} has no version string`,
    );
    assert.ok(
      !version.startsWith('^') && !version.startsWith('~'),
      `${dep} has a range prefix: "${version}"`,
    );
    assert.ok(
      isExactVersion(version),
      `${dep} version "${version}" is not a plain MAJOR.MINOR.PATCH pin`,
    );
  }, pkg.dependencies?.[dep] ?? '<missing>');
}

// ─── 3D runtime deps (three, @react-three/fiber) must be in `dependencies`,
//     not `devDependencies`, and pinned to a strict MAJOR.MINOR.PATCH. ────────
for (const dep of PINNED_3D_DEPS) {
  check(`dependencies.${dep} is present (not devDependencies) and strictly pinned`, () => {
    const deps = pkg.dependencies ?? {};
    const devs = pkg.devDependencies ?? {};
    assert.ok(dep in deps, `${dep} missing from dependencies`);
    assert.ok(
      !(dep in devs),
      `${dep} must not be declared in devDependencies (it is a runtime dependency)`,
    );
    const version = deps[dep];
    assert.ok(
      typeof version === 'string' && version.length > 0,
      `${dep} has no version string`,
    );
    assert.ok(
      !version.startsWith('^') && !version.startsWith('~'),
      `${dep} has a range prefix: "${version}"`,
    );
    assert.ok(
      isStrictVersion(version),
      `${dep} version "${version}" is not a strict MAJOR.MINOR.PATCH pin`,
    );
  }, pkg.dependencies?.[dep] ?? '<missing>');
}

// ─── fast-check must be in devDependencies for property tests. ───────────────
check('devDependencies.fast-check is present', () => {
  const devs = pkg.devDependencies ?? {};
  assert.ok('fast-check' in devs, 'fast-check missing from devDependencies');
  assert.ok(
    typeof devs['fast-check'] === 'string' && devs['fast-check'].length > 0,
    'fast-check has no version string',
  );
}, pkg.devDependencies?.['fast-check'] ?? '<missing>');

// ─── Summary ─────────────────────────────────────────────────────────────────
if (failures > 0) {
  console.log(`\n${failures} assertion(s) FAILED`);
  process.exit(1);
} else {
  console.log('\nAll dependency-cleanup assertions PASSED');
}
