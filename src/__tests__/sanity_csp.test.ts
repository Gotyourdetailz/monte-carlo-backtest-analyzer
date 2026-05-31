/**
 * Sanity test: index.html declares the Content Security Policy and referrer
 * meta tags required by Requirement 2.4 / 2.5 of the code-review-remediation
 * spec.
 *
 * Run with: npx tsx src/__tests__/sanity_csp.test.ts
 *
 * Prints PASS / FAIL per check and exits non-zero on any failure.
 *
 * Validates: Requirements 2.4
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const indexPath = resolve(repoRoot, 'index.html');

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

console.log(`\n[sanity_csp] reading ${indexPath}`);

const html = readFileSync(indexPath, 'utf8');

// Locate the CSP meta tag. We scan for the http-equiv attribute and then take
// the surrounding tag so the substring checks below run only against the CSP
// content (not unrelated HTML).
const cspTagMatch = html.match(
  /<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i,
);

check(
  'index.html contains a Content-Security-Policy meta tag',
  cspTagMatch !== null,
);

const cspTag = cspTagMatch ? cspTagMatch[0] : '';

check(
  "CSP includes 'wasm-unsafe-eval'",
  cspTag.includes("'wasm-unsafe-eval'"),
);

check(
  "CSP includes worker-src 'self' blob:",
  cspTag.includes("worker-src 'self' blob:"),
);

check(
  "CSP includes frame-ancestors 'none'",
  cspTag.includes("frame-ancestors 'none'"),
);

// Referrer policy meta tag.
const referrerTagMatch = html.match(
  /<meta[^>]*name=["']referrer["'][^>]*>/i,
);

check(
  'index.html contains a referrer meta tag',
  referrerTagMatch !== null,
);

const referrerTag = referrerTagMatch ? referrerTagMatch[0] : '';

check(
  'referrer meta tag uses strict-origin-when-cross-origin',
  referrerTag.includes('strict-origin-when-cross-origin'),
);

if (failures > 0) {
  console.log(`\n[sanity_csp] ${failures} check(s) failed`);
  process.exit(1);
}

console.log('\n[sanity_csp] all checks passed');
